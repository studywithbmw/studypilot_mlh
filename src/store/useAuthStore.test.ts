import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './useAuthStore';
import { useWorkspaceStore } from './useWorkspaceStore';

// Tests run with VITE_USE_MOCK unset, i.e. demo mode.
describe('auth store (demo mode)', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true, isOnboarded: true, user: useAuthStore.getState().user });
  });

  it('starts signed in as the demo user and is initialized', () => {
    const s = useAuthStore.getState();
    expect(s.initialized).toBe(true);
    expect(s.isAuthenticated).toBe(true);
    expect(s.user?.email).toBe('alex.chen@university.edu');
  });

  it('logout clears the user and resets workspaces', async () => {
    await useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBeNull();
    expect(useWorkspaceStore.getState().workspaces.length).toBeGreaterThan(0); // demo seed restored
  });

  it('signup requires onboarding, login does not', async () => {
    const sign = await useAuthStore.getState().signup('Sam', 'sam@x.com', 'Password1!');
    expect(sign.needsEmailConfirmation).toBe(false);
    expect(useAuthStore.getState().isOnboarded).toBe(false);
    await useAuthStore.getState().login('sam@x.com', 'Password1!');
    expect(useAuthStore.getState().isOnboarded).toBe(true);
  });

  it('completeOnboarding stores goal, subjects, language', async () => {
    await useAuthStore.getState().completeOnboarding('Pass exams', ['DBMS'], 'ta');
    const { user, isOnboarded } = useAuthStore.getState();
    expect(isOnboarded).toBe(true);
    expect(user).toMatchObject({ goal: 'Pass exams', subjects: ['DBMS'], preferredLanguage: 'ta', onboarded: true });
  });
});
