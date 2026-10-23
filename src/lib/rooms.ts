/**
 * Study Rooms client helpers.
 *
 * - `roomSocketUrl` turns the REST base URL into the backend's `/ws/rooms/{id}`
 *   endpoint (works for http/https and leaves non-/api/v1 bases untouched).
 * - Timers are always derived from the server's start timestamp, so a sleeping
 *   tab or a late snapshot cannot drift; clients never tick their own clock.
 * - `claimRoomCredit` makes sure one completed room timer is written into the
 *   local study tracker only once, even with two tabs open.
 */
import { API_URL } from './env';
import { ApiError } from './api/http';

/** Backend error message when there is one, else a translated fallback. */
export function roomErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function roomSocketUrl(roomId: string, apiUrl: string = API_URL): string {
  const root = apiUrl.replace(/\/+$/, '').replace(/\/api(?:\/v\d+)?$/i, '');
  const wsRoot = root.replace(/^http/i, 'ws');
  return `${wsRoot}/ws/rooms/${encodeURIComponent(roomId)}`;
}

/** Whole seconds left on a server-started timer (never negative). */
export function remainingSeconds(
  startedAt: string,
  durationS: number,
  nowMs: number = Date.now(),
): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(durationS)) return 0;
  return Math.max(0, Math.ceil((start + Math.max(0, durationS) * 1000 - nowMs) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const padded = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${padded}` : padded;
}

export function shareRoomUrl(code: string, origin: string = window.location.origin): string {
  return `${origin.replace(/\/+$/, '')}/app/rooms/${encodeURIComponent(code)}`;
}

const CREDIT_KEY = 'studypilot_room_credits';

/** True the first time this browser records a given room timer; false after that. */
export function claimRoomCredit(roomId: string, startedAt: string): boolean {
  const key = `${roomId}:${startedAt}`;
  try {
    const stored = window.localStorage.getItem(CREDIT_KEY);
    const keys: string[] = stored ? (JSON.parse(stored) as string[]) : [];
    if (!Array.isArray(keys)) return true;
    if (keys.includes(key)) return false;
    window.localStorage.setItem(CREDIT_KEY, JSON.stringify([...keys.slice(-200), key]));
    return true;
  } catch {
    // Storage can be unavailable (private mode); logging is still better than losing the session.
    return true;
  }
}
