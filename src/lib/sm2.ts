/**
 * SuperMemo 2 (SM-2) Spaced Repetition Algorithm Implementation
 * Pure function for spaced repetition intervals calculation.
 */

export type SM2Rating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface SM2State {
  repetition: number;   // Number of consecutive successful recall cycles
  interval: number;     // Days until next review
  easeFactor: number;   // E-Factor (minimum 1.3)
}

export interface SM2Result extends SM2State {
  dueDate: string;      // ISO string for next review
}

/**
 * Calculates the next review schedule based on the SM-2 algorithm.
 *
 * @param state Previous card state: repetition, interval, easeFactor
 * @param rating User recall grade (1 = Again, 2 = Hard, 3 = Good, 4 = Easy)
 * @param currentDate Optional reference date (default: now)
 * @returns Updated SM2State with the next interval and recalculated ease factor
 */
export function calculateSM2(
  state: SM2State,
  rating: SM2Rating,
  currentDate: Date = new Date()
): SM2Result {
  // Convert rating (1..4) to standard SM-2 0..5 scale:
  // 1 (Again) -> 1 (Fail)
  // 2 (Hard)  -> 3 (Pass with serious difficulty)
  // 3 (Good)  -> 4 (Pass after hesitation)
  // 4 (Easy)  -> 5 (Perfect recall)
  const q = rating === 1 ? 1 : rating === 2 ? 3 : rating === 3 ? 4 : 5;

  let repetition = state.repetition;
  let interval = state.interval;
  let easeFactor = state.easeFactor || 2.5;

  if (q >= 3) {
    // Correct response
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetition += 1;
  } else {
    // Failure (Again)
    repetition = 0;
    interval = 1;
  }

  // Update ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const deltaEF = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  easeFactor = Math.max(1.3, Number((easeFactor + deltaEF).toFixed(2)));

  // Calculate next due date
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + interval);

  return {
    repetition,
    interval,
    easeFactor,
    dueDate: nextDate.toISOString(),
  };
}

/**
 * Helper to display human-readable interval labels (e.g., "1d", "6d", "14d")
 */
export function formatIntervalLabel(rating: SM2Rating, state: SM2State): string {
  const result = calculateSM2(state, rating);
  if (result.interval === 1) return '< 1d';
  return `${result.interval}d`;
}
