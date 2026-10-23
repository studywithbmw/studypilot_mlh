import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AIModelId, ExplanationLevel, SupportedLanguage } from '../lib/constants';
import { changeLanguage } from '../lib/i18n';
import type { UserProfile } from '../types';

export type ThemeMode = 'dark' | 'light' | 'system';

interface SettingsState {
  theme: ThemeMode;
  explanationLevel: ExplanationLevel;
  answerLanguage: SupportedLanguage;
  model: AIModelId;
  hybridSearch: boolean;
  reranker: boolean;
  topK: number;
  memoryEnabled: boolean;
  setTheme: (theme: ThemeMode) => void;
  setExplanationLevel: (level: ExplanationLevel) => void;
  setAnswerLanguage: (lang: SupportedLanguage) => void;
  setModel: (model: AIModelId) => void;
  setHybridSearch: (enabled: boolean) => void;
  setReranker: (enabled: boolean) => void;
  setTopK: (k: number) => void;
  setMemoryEnabled: (enabled: boolean) => void;
  /** Overwrite local preferences with the signed-in user's server-side profile. */
  hydrateFromProfile: (profile: UserProfile) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      explanationLevel: 'student',
      answerLanguage: 'en',
      model: 'groq-llama',
      hybridSearch: true,
      reranker: true,
      topK: 5,
      memoryEnabled: true,

      setTheme: (theme: ThemeMode) => {
        set({ theme });
        applyTheme(theme);
      },

      setExplanationLevel: (explanationLevel) => set({ explanationLevel }),

      setAnswerLanguage: (answerLanguage) => {
        set({ answerLanguage });
        changeLanguage(answerLanguage);
      },

      setModel: (model) => set({ model }),
      setHybridSearch: (hybridSearch) => set({ hybridSearch }),
      setReranker: (reranker) => set({ reranker }),
      setTopK: (topK) => set({ topK }),
      setMemoryEnabled: (memoryEnabled) => set({ memoryEnabled }),

      hydrateFromProfile: (profile) => {
        set({
          explanationLevel: profile.defaultExplanationLevel,
          answerLanguage: profile.preferredLanguage,
          model: profile.defaultModel,
          hybridSearch: profile.hybridSearchEnabled,
          reranker: profile.rerankerEnabled,
          topK: profile.topK,
          memoryEnabled: profile.memoryEnabled,
        });
        changeLanguage(profile.preferredLanguage);
      },
    }),
    {
      name: 'studypilot_settings_storage',
    }
  )
);

export function applyTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.classList.toggle('dark', isDark);
  // Native form controls and scrollbars follow the same choice.
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

/** True when the effective theme is dark (resolves "system"). */
export function isDarkTheme(theme: ThemeMode): boolean {
  if (typeof window === 'undefined') return true;
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/**
 * Re-apply the theme when the OS scheme flips while "system" is selected.
 * Returns a cleanup function.
 */
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const { theme } = useSettingsStore.getState();
    if (theme === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
