import { describe, expect, it } from 'vitest';
import { formatClock, remainingSeconds, roomSocketUrl, shareRoomUrl } from './rooms';

describe('roomSocketUrl', () => {
  it('strips /api/v1 and keeps the host', () => {
    expect(roomSocketUrl('abc 123', 'http://localhost:7860/api/v1')).toBe(
      'ws://localhost:7860/ws/rooms/abc%20123',
    );
    expect(roomSocketUrl('room-1', 'https://api.example.com/api/v1/')).toBe(
      'wss://api.example.com/ws/rooms/room-1',
    );
  });

  it('works with bases that have no api prefix', () => {
    expect(roomSocketUrl('r1', 'http://127.0.0.1:8000')).toBe('ws://127.0.0.1:8000/ws/rooms/r1');
  });
});

describe('remainingSeconds', () => {
  const start = '2026-01-01T12:00:00+00:00';
  const at = (minutes: number) => Date.parse('2026-01-01T12:00:00Z') + minutes * 60_000;

  it('counts down from the server start timestamp', () => {
    expect(remainingSeconds(start, 1500, at(0))).toBe(1500);
    expect(remainingSeconds(start, 1500, at(10))).toBe(900);
    expect(remainingSeconds(start, 1500, at(24.5))).toBe(30);
  });

  it('never goes negative and tolerates bad input', () => {
    expect(remainingSeconds(start, 1500, at(30))).toBe(0);
    expect(remainingSeconds('not-a-date', 1500, at(0))).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('shareRoomUrl', () => {
  it('builds the share link from the code', () => {
    expect(shareRoomUrl('AB12CD', 'https://study.example.com/')).toBe(
      'https://study.example.com/app/rooms/AB12CD',
    );
  });
});
