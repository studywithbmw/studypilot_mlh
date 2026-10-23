import React, { useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ShieldCheck, MailCheck, Info } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuthStore } from '../store/useAuthStore';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../lib/constants';
import { USE_MOCK, isSupabaseConfigured } from '../lib/env';
import { safeNext } from '../lib/safeNext';
import { friendlyAuthError } from '../lib/authErrors';
import { toast } from 'sonner';

const emailField = z.string().trim().email('Please enter a valid email address');

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
  name: z.string().optional(),
});
const signupSchema = z.object({
  email: emailField,
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().trim().min(1, 'Please tell us your name').max(100),
});
const forgotSchema = z.object({
  email: emailField,
  password: z.string().optional(),
  name: z.string().optional(),
});

interface AuthFormData {
  email: string;
  password?: string;
  name?: string;
}

/** Errors thrown by the auth store already carry a safe message. */
function messageFor(err: unknown): string {
  if (err instanceof Error && err.name === 'AuthFlowError') return err.message;
  return friendlyAuthError(err);
}

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, signup, loginWithGoogle, sendPasswordReset } = useAuthStore();
  const isSignup = location.pathname === '/signup';
  const isForgot = location.pathname === '/forgot-password';
  const next = safeNext(searchParams.get('next'));
  const configMissing = !USE_MOCK && !isSupabaseConfigured;
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormData>({
    resolver: zodResolver(isSignup ? signupSchema : isForgot ? forgotSchema : loginSchema) as never,
    // Demo mode is prefilled so the tour is one click; real mode starts empty.
    defaultValues: USE_MOCK
      ? { email: 'alex.chen@university.edu', password: 'Password123!', name: 'Alex Chen' }
      : { email: '', password: '', name: '' },
  });

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass)) score += 25;
    if (/[^A-Za-z0-9]/.test(pass)) score += 25;
    return score;
  };

  const strength = getPasswordStrength(passwordValue);

  const onSubmit = async (data: AuthFormData) => {
    if (configMissing) {
      toast.error('Supabase is not configured for this build.');
      return;
    }
    try {
      if (isSignup) {
        const { needsEmailConfirmation } = await signup(data.name || 'New Learner', data.email, data.password);
        if (needsEmailConfirmation) {
          setNotice({
            title: 'Check your inbox',
            body: `We sent a confirmation link to ${data.email.trim()}. Open it, then come back and log in.`,
          });
          return;
        }
        toast.success('Account created! Welcome to StudyPilot.');
        navigate('/onboarding');
      } else if (isForgot) {
        await sendPasswordReset(data.email);
        // Same message whether or not the address has an account.
        setNotice({
          title: 'Check your inbox',
          body: 'If an account exists for that email, a password reset link is on its way.',
        });
      } else {
        await login(data.email, data.password);
        toast.success('Welcome back!');
        navigate(next, { replace: true });
      }
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  const handleGoogleLogin = async () => {
    if (configMissing) {
      toast.error('Supabase is not configured for this build.');
      return;
    }
    try {
      await loginWithGoogle();
      if (USE_MOCK) navigate(next, { replace: true });
    } catch (err) {
      toast.error(messageFor(err));
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Left Column: Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-8 sm:p-14">
        {/* Brand Lockup */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
            </svg>
          </div>
          <span className="font-bold text-base tracking-tight">{PRODUCT_NAME}</span>
        </Link>

        {/* Center Form Container */}
        <div className="max-w-md w-full mx-auto my-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {isForgot ? 'Reset Password' : isSignup ? 'Create Your Account' : 'Welcome Back'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isForgot
                ? 'Enter your email to receive a password recovery link.'
                : isSignup
                ? 'Start studying with citation-grounded RAG and career tools.'
                : 'Enter your credentials to access your study workspaces.'}
            </p>
          </div>

          {USE_MOCK && (
            <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
              <Info className="h-4 w-4 shrink-0 mt-px" />
              <span>
                <strong>Demo mode.</strong> Any credentials work and nothing is saved on a server.
              </span>
            </div>
          )}
          {configMissing && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-700 dark:text-red-300">
              <Info className="h-4 w-4 shrink-0 mt-px" />
              <span>
                Sign-in is not configured: set <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code>, or use <code>VITE_USE_MOCK=true</code>.
              </span>
            </div>
          )}
          {notice && (
            <div role="status" className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
              <MailCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{notice.title}</p>
                <p className="text-slate-600 dark:text-slate-300">{notice.body}</p>
                <Link to="/login" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </div>
          )}

          {/* Google Sign In button */}
          {!isForgot && !notice && (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                <span className="bg-background px-2 text-[10px] text-slate-400 uppercase font-mono tracking-wider absolute">
                  or with email
                </span>
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className={`space-y-4 ${notice ? 'hidden' : ''}`} noValidate>
            {isSignup && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <Input
                  {...register('name')}
                  placeholder="e.g. Alex Chen"
                  autoComplete="name"
                  className="text-xs"
                />
                {errors.name && (
                  <p className="text-[11px] text-red-500 mt-1">{errors.name.message}</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <Input
                {...register('email')}
                type="email"
                placeholder="name@university.edu"
                autoComplete="email"
                className="text-xs"
              />
              {errors.email && (
                <p className="text-[11px] text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {!isForgot && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  {!isSignup && (
                    <Link to="/forgot-password" className="text-[11px] text-emerald-500 hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <Input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    onChange={(e) => {
                      register('password').onChange(e);
                      setPasswordValue(e.target.value);
                    }}
                    className="text-xs pr-9"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-red-500 mt-1">{errors.password.message}</p>
                )}

                {/* Password Strength Meter */}
                {isSignup && passwordValue && (
                  <div className="pt-1.5 space-y-1">
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          strength <= 25 ? 'bg-red-500 w-1/4' : strength <= 50 ? 'bg-amber-500 w-2/4' : strength <= 75 ? 'bg-blue-500 w-3/4' : 'bg-emerald-500 w-full'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Strength: {strength >= 100 ? 'Strong' : strength >= 50 ? 'Moderate' : 'Weak'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full text-xs h-10 mt-2">
              {isSubmitting
                ? 'Processing...'
                : isForgot
                ? 'Send Recovery Email'
                : isSignup
                ? 'Create Account'
                : 'Sign In to Workspace'}
            </Button>
          </form>

          {/* Toggle between Login and Signup */}
          <div className="text-center text-xs text-slate-500">
            {isSignup ? (
              <span>
                Already have an account?{' '}
                <Link to="/login" className="text-emerald-500 font-medium hover:underline">
                  Sign In
                </Link>
              </span>
            ) : isForgot ? (
              <Link to="/login" className="text-emerald-500 font-medium hover:underline">
                Back to Sign In
              </Link>
            ) : (
              <span>
                Don't have an account?{' '}
                <Link to="/signup" className="text-emerald-500 font-medium hover:underline">
                  Sign Up
                </Link>
              </span>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-[11px] text-slate-400 text-center">
          By signing in, you agree to StudyPilot Terms of Service & Privacy Policy.
        </div>
      </div>

      {/* Right Column: Animated Showcase Side */}
      <div className="hidden lg:flex w-1/2 bg-slate-950 text-white p-14 flex-col justify-between relative overflow-hidden border-l border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(16,185,129,0.15)_0%,transparent_60%)] pointer-events-none" />

        <div className="z-10 flex items-center justify-between">
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">
            {PRODUCT_TAGLINE}
          </span>
          <span className="text-[11px] text-slate-400">Your documents stay private to your account</span>
        </div>

        {/* Feature Highlights Card Stack */}
        <div className="z-10 max-w-lg space-y-4 my-auto">
          <div className="p-5 rounded-2xl border border-emerald-500/30 bg-slate-900/80 backdrop-blur-md shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="h-4 w-4" />
              <span>Multi-Agent Grounding Invariant</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              "Strict 2PL prevents cascading rollbacks by holding exclusive locks until commit. Grounded in Chapter 7, Page 14."
            </p>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span className="text-emerald-400 font-bold">[1] DBMS Notes.pdf: p.14</span>
              <span>·</span>
              <span>98% Confidence</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-xs text-slate-400 space-y-1">
            <span className="text-[10px] text-emerald-400 uppercase font-mono font-semibold">Career Acceleration</span>
            <p className="text-slate-300">
              Transformed 12 passive bullets into quantified achievements with +58% higher ATS keyword match.
            </p>
          </div>
        </div>

        <div className="z-10 text-xs text-slate-500 flex items-center justify-between">
          <span>Citation-grounded answers</span>
          <span>SM-2 spaced repetition</span>
        </div>
      </div>
    </div>
  );
};
