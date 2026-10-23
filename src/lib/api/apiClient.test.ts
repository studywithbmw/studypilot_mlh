import { describe, expect, it } from 'vitest';
import { toProfilePatch } from './apiClient';

describe('toProfilePatch', () => {
  it('keeps only fields the backend accepts', () => {
    const out = toProfilePatch({
      id: 'x', email: 'a@b.c', streakDays: 3, name: 'Al', topK: 7, goal: undefined,
    } as never);
    expect(out).toEqual({ name: 'Al', topK: 7 });
  });
});
