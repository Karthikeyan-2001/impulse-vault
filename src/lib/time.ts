/** Cooldown math. Pure; `now` is always passed in so everything is testable. */

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export type CooldownPreset = '24h' | '72h' | '7d';

export const COOLDOWN_PRESETS: Record<CooldownPreset, number> = {
  '24h': 24,
  '72h': 72,
  '7d': 168,
};

export function presetLabel(hours: number): string {
  if (hours % 24 === 0 && hours >= 168) return `${hours / 24} days`;
  return `${hours}h`;
}

export function computeUnlockAt(vaultedAt: number, cooldownHours: number): number {
  return vaultedAt + cooldownHours * HOUR;
}

export function remainingMs(unlockAt: number, now: number): number {
  return Math.max(0, unlockAt - now);
}

export function isDue(unlockAt: number, now: number): boolean {
  return now >= unlockAt;
}

/** Ripe items ignored this long are softly auto-declined. Timer truth is still `unlockAt`. */
export function isExpired(unlockAt: number, now: number, expiryDays: number): boolean {
  return now >= unlockAt + expiryDays * DAY;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Human remaining time, as copy: "41 hours", "4 days, 3 hours", "12 minutes".
 * Hours stay hours up to 96h so the default 72h cooldown reads "71 hours", not "2 days, 23 hours".
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'no time';
  if (ms < MINUTE) return 'less than a minute';
  const totalMinutes = Math.floor(ms / MINUTE);
  if (totalMinutes < 60) return plural(totalMinutes, 'minute');
  const totalHours = Math.floor(ms / HOUR);
  if (totalHours < 2) {
    const mins = totalMinutes - 60;
    return mins > 0 ? `1 hour ${plural(mins, 'minute')}` : '1 hour';
  }
  if (totalHours < 96) return plural(totalHours, 'hour');
  const days = Math.floor(totalHours / 24);
  const hours = totalHours - days * 24;
  return hours > 0 ? `${plural(days, 'day')}, ${plural(hours, 'hour')}` : plural(days, 'day');
}

/** Live countdown "71:59:42"; past 99h switches to "6d 23:59:42". */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(s / 3600);
  const mm = pad(Math.floor((s % 3600) / 60));
  const ss = pad(s % 60);
  if (hours > 99) {
    const d = Math.floor(hours / 24);
    return `${d}d ${pad(hours % 24)}:${mm}:${ss}`;
  }
  return `${pad(hours)}:${mm}:${ss}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * When you wanted it, phrased for "You wanted this ___."
 * "earlier today" · "yesterday" · "on Tuesday" (within a week) · "on 3 Sep".
 */
export function describeWhen(then: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  const d = new Date(then);
  if (days < 7) return `on ${WEEKDAYS[d.getDay()]}`;
  return `on ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface QuietHours {
  enabled: boolean;
  /** "22:00" local time */
  start: string;
  /** "08:00" local time; may be earlier than start (wraps past midnight) */
  end: string;
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minuteOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

export function isInQuietHours(now: number, q: QuietHours): boolean {
  if (!q.enabled) return false;
  const start = parseHm(q.start);
  const end = parseHm(q.end);
  if (start === null || end === null || start === end) return false;
  const m = minuteOfDay(now);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** Epoch ms when the current quiet period ends (only meaningful while inside it). */
export function quietHoursEnd(now: number, q: QuietHours): number {
  const end = parseHm(q.end) ?? 0;
  const d = new Date(now);
  d.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
