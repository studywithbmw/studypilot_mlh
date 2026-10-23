import { describe, expect, it } from 'vitest';
import { friendlyAuthError } from './authErrors';

describe('friendlyAuthError', () => {
  it('maps known codes', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials' })).toMatch(/Incorrect email or password/);
    expect(friendlyAuthError({ code: 'email_not_confirmed' })).toMatch(/confirm your email/);
    expect(friendlyAuthError({ code: 'user_already_exists' })).toMatch(/already exists/);
    expect(friendlyAuthError({ code: 'weak_password' })).toMatch(/too weak/);
    expect(friendlyAuthError({ status: 429 })).toMatch(/Too many attempts/);
  });
  it('maps by message when there is no code', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toMatch(/Incorrect/);
    expect(friendlyAuthError({ message: 'Failed to fetch' })).toMatch(/Could not reach/);
  });
  it('never leaks raw provider text', () => {
    const out = friendlyAuthError({ message: 'secret internal detail xyz' });
    expect(out).not.toContain('xyz');
    expect(friendlyAuthError(undefined)).toBe('Something went wrong. Please try again.');
  });
});
