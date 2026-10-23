import { describe, expect, it } from 'vitest';
import { readEnv } from './env';

const raw = (o: Record<string, string>) => o as unknown as ImportMetaEnv;

describe('readEnv', () => {
  it('defaults to demo mode', () => {
    expect(readEnv(raw({})).useMock).toBe(true);
    expect(readEnv(raw({ VITE_USE_MOCK: 'true' })).useMock).toBe(true);
  });
  it('only the literal "false" enables real mode', () => {
    expect(readEnv(raw({ VITE_USE_MOCK: 'false' })).useMock).toBe(false);
    expect(readEnv(raw({ VITE_USE_MOCK: '0' })).useMock).toBe(true);
  });
  it('normalises the API url', () => {
    expect(readEnv(raw({ VITE_API_URL: 'http://x/api/v1///' })).apiUrl).toBe('http://x/api/v1');
    expect(readEnv(raw({})).apiUrl).toBe('http://localhost:7860/api/v1');
  });
});
