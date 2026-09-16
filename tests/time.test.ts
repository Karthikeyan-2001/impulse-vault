import { describe, expect, it } from 'vitest';
import {
  DAY,
  HOUR,
  MINUTE,
  computeUnlockAt,
  describeWhen,
  formatCountdown,
  formatRemaining,
  isDue,
  isExpired,
  isInQuietHours,
  quietHoursEnd,
  remainingMs,
} from '../src/lib/time';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('cooldown math', () => {
  const vaultedAt = at(2026, 9, 15, 10);

  it('unlockAt = vaultedAt + hours', () => {
    expect(computeUnlockAt(vaultedAt, 72)).toBe(vaultedAt + 72 * HOUR);
    expect(computeUnlockAt(vaultedAt, 24)).toBe(vaultedAt + DAY);
    expect(computeUnlockAt(vaultedAt, 168)).toBe(vaultedAt + 7 * DAY);
  });

  it('remaining never goes negative', () => {
    const unlockAt = computeUnlockAt(vaultedAt, 72);
    expect(remainingMs(unlockAt, vaultedAt)).toBe(72 * HOUR);
    expect(remainingMs(unlockAt, unlockAt + 5)).toBe(0);
  });

  it('is due exactly at unlockAt, not a millisecond before', () => {
    const unlockAt = computeUnlockAt(vaultedAt, 72);
    expect(isDue(unlockAt, unlockAt - 1)).toBe(false);
    expect(isDue(unlockAt, unlockAt)).toBe(true);
  });

  it('expires N days after ripening', () => {
    const unlockAt = computeUnlockAt(vaultedAt, 72);
    expect(isExpired(unlockAt, unlockAt + 14 * DAY - 1, 14)).toBe(false);
    expect(isExpired(unlockAt, unlockAt + 14 * DAY, 14)).toBe(true);
  });
});

describe('formatRemaining', () => {
  it.each([
    [0, 'no time'],
    [30_000, 'less than a minute'],
    [MINUTE, '1 minute'],
    [12 * MINUTE, '12 minutes'],
    [HOUR, '1 hour'],
    [HOUR + 20 * MINUTE, '1 hour 20 minutes'],
    [41 * HOUR + 59 * MINUTE, '41 hours'],
    [72 * HOUR, '72 hours'],
    [95 * HOUR, '95 hours'],
    [4 * DAY + 3 * HOUR, '4 days, 3 hours'],
    [7 * DAY, '7 days'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe('formatCountdown', () => {
  it('pads hh:mm:ss', () => {
    expect(formatCountdown(71 * HOUR + 59 * MINUTE + 42_000)).toBe('71:59:42');
    expect(formatCountdown(5_000)).toBe('00:00:05');
    expect(formatCountdown(-1)).toBe('00:00:00');
  });

  it('switches to days past 99 hours', () => {
    expect(formatCountdown(167 * HOUR + 59 * MINUTE + 59_000)).toBe('6d 23:59:59');
  });
});

describe('describeWhen — "You wanted this ___."', () => {
  const now = at(2026, 9, 17, 15); // Thursday
  it.each([
    [at(2026, 9, 17, 9), 'earlier today'],
    [at(2026, 9, 16, 23, 59), 'yesterday'],
    [at(2026, 9, 15, 10), 'on Tuesday'],
    [at(2026, 9, 11, 10), 'on Friday'],
    [at(2026, 9, 3, 10), 'on 3 Sep'],
  ])('%d → %s', (then, text) => {
    expect(describeWhen(then, now)).toBe(text);
  });
});

describe('quiet hours', () => {
  const overnight = { enabled: true, start: '22:00', end: '08:00' };
  const daytime = { enabled: true, start: '13:00', end: '14:30' };

  it('handles windows that wrap past midnight', () => {
    expect(isInQuietHours(at(2026, 9, 15, 23), overnight)).toBe(true);
    expect(isInQuietHours(at(2026, 9, 15, 3), overnight)).toBe(true);
    expect(isInQuietHours(at(2026, 9, 15, 8), overnight)).toBe(false);
    expect(isInQuietHours(at(2026, 9, 15, 12), overnight)).toBe(false);
  });

  it('handles same-day windows', () => {
    expect(isInQuietHours(at(2026, 9, 15, 13, 45), daytime)).toBe(true);
    expect(isInQuietHours(at(2026, 9, 15, 14, 30), daytime)).toBe(false);
  });

  it('is off when disabled or malformed', () => {
    expect(isInQuietHours(at(2026, 9, 15, 23), { ...overnight, enabled: false })).toBe(false);
    expect(isInQuietHours(at(2026, 9, 15, 23), { enabled: true, start: 'late', end: '08:00' })).toBe(false);
  });

  it('computes when the quiet period ends', () => {
    expect(quietHoursEnd(at(2026, 9, 15, 23), overnight)).toBe(at(2026, 9, 16, 8));
    expect(quietHoursEnd(at(2026, 9, 16, 3), overnight)).toBe(at(2026, 9, 16, 8));
  });
});
