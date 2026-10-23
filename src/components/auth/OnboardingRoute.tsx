import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

/** /onboarding needs a signed-in user; finished users skip straight to the app. */
export const OnboardingRoute: React.FC = () => {
  const { initialized, isAuthenticated, isOnboarded, user, initAuth } = useAuthStore();

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  if (!initialized || (isAuthenticated && !user)) {
    return (
      <div role="status" className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isOnboarded) return <Navigate to="/app" replace />;
  return <Outlet />;
};
