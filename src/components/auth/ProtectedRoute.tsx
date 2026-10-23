import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { USE_MOCK } from '../../lib/env';
import { Button } from '../ui/button';

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-foreground"
    >
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Guards /app/*. Waits for the session check, sends signed-out visitors to
 * /login (remembering where they were going), and sends new users through
 * onboarding. Also loads the user's workspaces once signed in.
 */
export const ProtectedRoute: React.FC = () => {
  const location = useLocation();
  const { initialized, isAuthenticated, isOnboarded, user, profileError, initAuth, loadProfile, logout } =
    useAuthStore();
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const userId = user?.id;
  useEffect(() => {
    if (initialized && isAuthenticated && userId) void loadWorkspaces();
  }, [initialized, isAuthenticated, userId, loadWorkspaces]);

  if (!initialized) return <FullScreenSpinner label="Checking your session…" />;

  if (!isAuthenticated) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  // Signed in with Supabase, but the StudyPilot API is unreachable/failing.
  if (!user && !USE_MOCK) {
    if (!profileError) return <FullScreenSpinner label="Loading your profile…" />;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-foreground">
        <div role="alert" className="max-w-sm text-center space-y-4">
          <h1 className="text-lg font-semibold">Can’t reach StudyPilot right now</h1>
          <p className="text-sm text-muted-foreground">{profileError}</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => void loadProfile()}>
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isOnboarded) return <Navigate to="/onboarding" replace />;

  return <Outlet />;
};
