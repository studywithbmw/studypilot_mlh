/**
 * Turn Supabase / network auth failures into short, safe, human messages.
 * Raw provider messages are never shown (they can be technical or leak detail).
 */
interface MaybeAuthError {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

export function friendlyAuthError(err: unknown): string {
  const e = (err ?? {}) as MaybeAuthError;
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (code === 'weak_password' || msg.includes('password should be')) {
    return 'That password is too weak. Use at least 8 characters with a mix of letters, numbers and symbols.';
  }
  if (code === 'same_password') {
    return 'Your new password must be different from the old one.';
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    e.status === 429 ||
    msg.includes('rate limit')
  ) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (code === 'signup_disabled' || code === 'email_provider_disabled') {
    return 'Sign-ups are currently disabled.';
  }
  if (code === 'session_expired' || code === 'session_not_found' || msg.includes('session')) {
    return 'Your session has expired. Please log in again.';
  }
  if (e.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Could not reach the authentication server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
