/**
 * Unit tests for SuperMemo SM-2 algorithm
 */
import { describe, it, expect } from 'vitest';
import { calculateSM2, formatIntervalLabel, type SM2State } from './sm2';

describe('SM-2 Spaced Repetition Algorithm', () => {
  const initialState: SM2State = {
    repetition: 0,
    interval: 0,
    easeFactor: 2.5,
  };

  it('sets interval to 1 day on first successful recall (Good)', () => {
    const result = calculateSM2(initialState, 3);
    expect(result.repetition).toBe(1);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  it('sets interval to 6 days on second successful recall', () => {
    const state1 = calculateSM2(initialState, 3);
    const state2 = calculateSM2(state1, 3);
    expect(state2.repetition).toBe(2);
    expect(state2.interval).toBe(6);
  });

  it('scales interval by ease factor on third successful recall', () => {
    const state1 = calculateSM2(initialState, 4);
    const state2 = calculateSM2(state1, 4);
    const state3 = calculateSM2(state2, 4);
    expect(state3.repetition).toBe(3);
    expect(state3.interval).toBe(Math.round(6 * state2.easeFactor));
  });

  it('resets repetition and sets interval to 1 on failure (Again)', () => {
    const advancedState: SM2State = {
      repetition: 4,
      interval: 24,
      easeFactor: 2.6,
    };
    const result = calculateSM2(advancedState, 1);
    expect(result.repetition).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeLessThan(2.6);
  });

  it('never drops ease factor below 1.3 minimum', () => {
    let state: SM2State = { repetition: 0, interval: 1, easeFactor: 1.35 };
    for (let i = 0; i < 5; i++) {
      state = calculateSM2(state, 1);
    }
    expect(state.easeFactor).toBe(1.3);
  });

  it('formats interval labels properly', () => {
    const labelAgain = formatIntervalLabel(1, initialState);
    expect(labelAgain).toBe('< 1d');
  });
});
