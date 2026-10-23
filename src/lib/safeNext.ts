/** Paths that must never be a post-login destination (would loop). */
const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

/**
 * Validate a `next` redirect target. Only same-origin, absolute-path targets
 * are allowed — no `//host`, no `/\host`, no schemes, no control characters —
 * so a crafted link can't bounce a user to another site after login.
 */
export function safeNext(raw: string | null | undefined, fallback = '/app'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  if (raw.length > 512) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  let path = raw;
  try {
    // Resolving against a dummy origin catches tricks like "/%2f/evil.com"
    // being normalised into another host by a downstream router.
    const url = new URL(raw, 'http://safe.invalid');
    if (url.origin !== 'http://safe.invalid') return fallback;
    path = url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
  if (path.startsWith('//')) return fallback;
  // Encoded tricks (%0d%0a, %5c, %2f%2f) are rejected too: decode and re-check.
  try {
    const decoded = decodeURIComponent(path);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.startsWith('//')) return fallback;
  } catch {
    return fallback;
  }
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) {
    return fallback;
  }
  return path;
}
