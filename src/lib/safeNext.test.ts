import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('allows same-origin app paths with query', () => {
    expect(safeNext('/app/chat?x=1')).toBe('/app/chat?x=1');
    expect(safeNext('/app')).toBe('/app');
  });
  it.each([
    'https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', 'evil.com',
    '/%0d%0aSet-Cookie:x', '/app\nfoo', '', null, undefined, '/' + 'a'.repeat(600),
  ])('rejects %s', (raw) => {
    expect(safeNext(raw as string | null | undefined)).toBe('/app');
  });
  it('rejects auth pages to avoid redirect loops', () => {
    for (const p of ['/login', '/signup', '/forgot-password', '/reset-password', '/login?next=/app']) {
      expect(safeNext(p)).toBe('/app');
    }
  });
  it('honours a custom fallback', () => {
    expect(safeNext('//x', '/home')).toBe('/home');
  });
});
