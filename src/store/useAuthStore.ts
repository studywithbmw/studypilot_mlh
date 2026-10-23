import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { UserProfile } from '../types';
import { MOCK_USER } from '../mocks/seedData';
import { api } from '../lib/api';
import { setAuthHooks } from '../lib/api/http';
import { USE_MOCK, isSupabaseConfigured } from '../lib/env';
import { getSupabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { friendlyAuthError } from '../lib/authErrors';
import { changeLanguage } from '../lib/i18n';
import { useSettingsStore } from './useSettingsStore';
import { useWorkspaceStore } from './useWorkspaceStore';

type Language = 'en' | 'ta' | 'hi';

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  /** False until the first session check finishes (real mode only). */
  initialized: boolean;
  /** Set when signed in but the backend profile could not be loaded. */
  profileError: string | null;
  /** True after following a password-recovery email link. */
  recovery: boolean;

  initAuth: () => Promise<void>;
  loadProfile: () => Promise<void>;
  login: (email: string, password?: string) => Promise<void>;
  signup: (name: string, email: string, password?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  loginWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserPreferences: (updates: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: (goal: string, subjects: string[], language: Language) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

/** Thrown with a safe, user-facing message; the UI shows `.message` directly. */
export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

function requireSupabase() {
  const sb = getSupabase();
  if (!sb) {
    throw new AuthFlowError(
      isSupabaseConfigured
        ? 'Authentication is unavailable in demo mode.'
        : 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return sb;
}

let initPromise: Promise<void> | null = null;
let profileInFlight: Promise<void> | null = null;
let settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
let applyingServerSettings = false;

function clearClientData() {
  queryClient.clear();
  useWorkspaceStore.getState().reset();
}

const SIGNED_OUT = {
  user: null,
  isAuthenticated: false,
  isOnboarded: false,
  profileError: null,
  recovery: false,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const applyProfile = (profile: UserProfile) => {
        applyingServerSettings = true;
        try {
          useSettingsStore.getState().hydrateFromProfile(profile);
        } finally {
          applyingServerSettings = false;
        }
        set({
          user: profile,
          isAuthenticated: true,
          isOnboarded: profile.onboarded ?? true,
          profileError: null,
        });
      };

      /** Local sign-out that never calls the network (used on 401 / SIGNED_OUT). */
      const clearLocalSession = () => {
        clearClientData();
        set({ ...SIGNED_OUT });
      };

      /** Push changed AI preferences to the server (debounced, real mode only). */
      const startSettingsSync = () => {
        useSettingsStore.subscribe((s, prev) => {
          if (USE_MOCK || applyingServerSettings || !get().isAuthenticated) return;
          const changed =
            s.explanationLevel !== prev.explanationLevel ||
            s.answerLanguage !== prev.answerLanguage ||
            s.model !== prev.model ||
            s.hybridSearch !== prev.hybridSearch ||
            s.reranker !== prev.reranker ||
            s.topK !== prev.topK ||
            s.memoryEnabled !== prev.memoryEnabled;
          if (!changed) return;
          if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
          settingsSyncTimer = setTimeout(() => {
            const cur = useSettingsStore.getState();
            api
              .updatePreferences({
                defaultExplanationLevel: cur.explanationLevel,
                preferredLanguage: cur.answerLanguage,
                defaultModel: cur.model,
                hybridSearchEnabled: cur.hybridSearch,
                rerankerEnabled: cur.reranker,
                topK: cur.topK,
                memoryEnabled: cur.memoryEnabled,
              })
              .then((u) => set({ user: u }))
              .catch(() => undefined); // best-effort; local value stays
          }, 600);
        });
      };

      return {
        user: USE_MOCK ? MOCK_USER : null,
        isAuthenticated: USE_MOCK,
        isOnboarded: USE_MOCK,
        initialized: USE_MOCK,
        profileError: null,
        recovery: false,

        initAuth: () => {
          if (USE_MOCK) return Promise.resolve();
          if (initPromise) return initPromise;
          initPromise = (async () => {
            const sb = getSupabase();
            if (!sb) {
              set({ initialized: true });
              return;
            }

            setAuthHooks({
              getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
              refresh: async () => (await sb.auth.refreshSession()).data.session?.access_token ?? null,
              onUnauthorized: () => {
                // Token rejected even after a refresh (expired / account deleted).
                void sb.auth.signOut({ scope: 'local' }).finally(clearLocalSession);
              },
            });

            // IMPORTANT: never await other Supabase calls inside this callback
            // (it can deadlock the client); defer with setTimeout.
            sb.auth.onAuthStateChange((event: string, session: Session | null) => {
              if (event === 'SIGNED_OUT') {
                setTimeout(clearLocalSession, 0);
              } else if (event === 'PASSWORD_RECOVERY') {
                set({ recovery: true });
              } else if (
                (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
                session &&
                get().user?.id !== session.user.id
              ) {
                setTimeout(() => void get().loadProfile(), 0);
              }
            });

            startSettingsSync();

            try {
              const { data } = await sb.auth.getSession();
              if (data.session) {
                set({ isAuthenticated: true });
                await get().loadProfile();
              }
            } catch {
              // Treated as signed out; the login page will recover.
            } finally {
              set({ initialized: true });
            }
          })();
          return initPromise;
        },

        loadProfile: () => {
          if (USE_MOCK) return Promise.resolve();
          if (profileInFlight) return profileInFlight;
          profileInFlight = (async () => {
            try {
              applyProfile(await api.getProfile());
            } catch (err) {
              // A 401 already triggered sign-out through onUnauthorized.
              const status = (err as { status?: number })?.status;
              if (status !== 401) {
                set({
                  isAuthenticated: true,
                  profileError:
                    (err as { message?: string })?.message ||
                    'Could not load your profile from the StudyPilot server.',
                });
              }
            } finally {
              profileInFlight = null;
            }
          })();
          return profileInFlight;
        },

        login: async (email, password) => {
          if (USE_MOCK) {
            const res = await api.login(email);
            set({ user: res.user, isAuthenticated: true, isOnboarded: true, initialized: true });
            return;
          }
          const sb = requireSupabase();
          const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: password ?? '' });
          if (error) throw new AuthFlowError(friendlyAuthError(error));
          await get().loadProfile();
          if (get().profileError) {
            throw new AuthFlowError('Signed in, but the StudyPilot server could not be reached.');
          }
          // loadProfile signs the user out again when the API answers 401.
          if (!get().isAuthenticated || !get().user) {
            throw new AuthFlowError(
              'You signed in, but the StudyPilot server rejected your session (401). ' +
                "Check that the backend's SUPABASE_URL and SUPABASE_JWT_SECRET belong to this Supabase project, then restart the backend.",
            );
          }
        },

        signup: async (name, email, password) => {
          if (USE_MOCK) {
            const res = await api.signup(name, email);
            set({ user: res.user, isAuthenticated: true, isOnboarded: false, initialized: true });
            return { needsEmailConfirmation: false };
          }
          const sb = requireSupabase();
          const { data, error } = await sb.auth.signUp({
            email: email.trim(),
            password: password ?? '',
            options: {
              data: { name: name.trim() },
              emailRedirectTo: `${window.location.origin}/login`,
            },
          });
          if (error) throw new AuthFlowError(friendlyAuthError(error));
          // Supabase hides "already registered" by returning a user with no
          // identities. Surface it so people aren't left waiting for an email.
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new AuthFlowError(friendlyAuthError({ code: 'user_already_exists' }));
          }
          if (!data.session) return { needsEmailConfirmation: true };
          await get().loadProfile();
          return { needsEmailConfirmation: false };
        },

        loginWithGoogle: async () => {
          if (USE_MOCK) {
            const res = await api.login('alex.chen@gmail.com');
            set({ user: res.user, isAuthenticated: true, isOnboarded: true, initialized: true });
            return;
          }
          const sb = requireSupabase();
          const { error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/app` },
          });
          if (error) throw new AuthFlowError(friendlyAuthError(error));
          // The browser is redirected to Google; nothing else to do here.
        },

        sendPasswordReset: async (email) => {
          if (USE_MOCK) return;
          const sb = requireSupabase();
          const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          // Only surface failures that aren't about the account (rate limit,
          // network). Unknown emails look identical to known ones.
          if (error && (error.status === 429 || /rate|fetch|network/i.test(error.message))) {
            throw new AuthFlowError(friendlyAuthError(error));
          }
        },

        updatePassword: async (newPassword) => {
          if (USE_MOCK) return;
          const sb = requireSupabase();
          const { error } = await sb.auth.updateUser({ password: newPassword });
          if (error) throw new AuthFlowError(friendlyAuthError(error));
          set({ recovery: false });
        },

        logout: async () => {
          if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
          if (!USE_MOCK) {
            const sb = getSupabase();
            if (sb) {
              try {
                await sb.auth.signOut();
              } catch {
                await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
              }
            }
          }
          clearLocalSession();
        },

        updateUserPreferences: async (updates) => {
          const updated = await api.updatePreferences(updates);
          set({ user: updated });
        },

        completeOnboarding: async (goal, subjects, language) => {
          changeLanguage(language);
          if (USE_MOCK) {
            const current = get().user || MOCK_USER;
            set({
              isOnboarded: true,
              user: { ...current, goal, subjects, preferredLanguage: language, onboarded: true },
            });
            return;
          }
          const updated = await api.updatePreferences({
            goal,
            subjects,
            preferredLanguage: language,
            onboarded: true,
          });
          applyProfile(updated);
        },

        deleteAccount: async () => {
          await api.deleteAccount();
          const sb = getSupabase();
          if (sb) await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
          clearLocalSession();
        },
      };
    },
    {
      name: 'studypilot_auth_storage',
      // Real mode must never trust localStorage for identity: an old demo-mode
      // blob (fake user, isAuthenticated: true) is ignored entirely.
      merge: (persisted, current) =>
        USE_MOCK ? { ...current, ...(persisted as Partial<AuthState>) } : current,
      // Real mode persists NOTHING here: Supabase keeps its own session, and the
      // profile is always re-fetched from the server. Demo mode keeps the fake
      // user so a refresh doesn't log the demo out.
      partialize: (state) =>
        USE_MOCK
          ? { user: state.user, isAuthenticated: state.isAuthenticated, isOnboarded: state.isOnboarded }
          : {},
    }
  )
);
