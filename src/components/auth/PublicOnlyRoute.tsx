import React, { useEffect } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { safeNext } from '../../lib/safeNext';

/**
 * Wraps /login, /signup and /forgot-password. Signed-in users are redirected
 * on to `?next=` (validated) or the app. Renders the page immediately while
 * the session check runs so the form never flashes a spinner.
 */
export const PublicOnlyRoute: React.FC = () => {
  const [params] = useSearchParams();
  const { initialized, isAuthenticated, isOnboarded, user, initAuth, recovery } = useAuthStore();

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  if (initialized && isAuthenticated && user && !recovery) {
    return <Navigate to={isOnboarded ? safeNext(params.get('next')) : '/onboarding'} replace />;
  }
  return <Outlet />;
};
