import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuthStore } from '../store/useAuthStore';
import { PRODUCT_NAME } from '../lib/constants';
import { USE_MOCK } from '../lib/env';
import { friendlyAuthError } from '../lib/authErrors';
import { toast } from 'sonner';

/**
 * Landing page of the password-recovery email link. Supabase signs the user in
 * with a short-lived recovery session; here they choose a new password.
 */
export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { initialized, isAuthenticated, initAuth, updatePassword } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters long.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success('Password updated.');
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.name === 'AuthFlowError' ? err.message : friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = initialized && isAuthenticated;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <Link to="/" className="font-bold text-base tracking-tight mb-8">{PRODUCT_NAME}</Link>
      <div className="w-full max-w-sm space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
        {USE_MOCK ? (
          <p className="text-xs text-slate-500">Password reset is not available in demo mode.</p>
        ) : !initialized ? (
          <p role="status" className="text-xs text-slate-500">Verifying your reset link…</p>
        ) : !ready ? (
          <div role="alert" className="space-y-3 text-xs">
            <p className="text-red-500">This reset link is invalid or has expired.</p>
            <Link to="/forgot-password" className="text-emerald-500 font-medium hover:underline">
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <label htmlFor="new-password" className="text-xs font-medium">New password</label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="text-xs font-medium">Confirm password</label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className="text-xs" />
            </div>
            {error && <p role="alert" className="text-[11px] text-red-500">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full text-xs h-10">
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
