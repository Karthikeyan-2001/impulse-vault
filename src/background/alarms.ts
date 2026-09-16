/**
 * chrome.alarms only — the worker is killed aggressively, so no timers longer than a second.
 * One alarm per cooling item (punctuality) plus a 5-minute sweep (the real guarantee).
 */
import type { VaultItem } from '../types';

export const ALARM = {
  sweep: 'vault:sweep',
  quiet: 'vault:quiet',
  passes: 'vault:passes',
  itemPrefix: 'vault:item:',
} as const;

export async function ensureSweepAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM.sweep);
  if (!existing) await chrome.alarms.create(ALARM.sweep, { periodInMinutes: 5, delayInMinutes: 1 });
}

/** Exactly one alarm per cooling item, at its unlockAt. Stale ones are removed. */
export async function syncItemAlarms(items: VaultItem[]): Promise<void> {
  const all = await chrome.alarms.getAll();
  const want = new Map(items.filter((i) => i.state === 'cooling').map((i) => [ALARM.itemPrefix + i.id, i.unlockAt]));
  for (const a of all) {
    if (!a.name.startsWith(ALARM.itemPrefix)) continue;
    const when = want.get(a.name);
    if (when === undefined) await chrome.alarms.clear(a.name);
    else if (Math.abs(a.scheduledTime - when) < 1000) want.delete(a.name);
  }
  for (const [name, when] of want) {
    // Past-due alarms fire right away; the sweep would catch them anyway.
    await chrome.alarms.create(name, { when: Math.max(when, Date.now() + 500) });
  }
}

export async function scheduleAt(name: string, when: number | null): Promise<void> {
  if (when === null) await chrome.alarms.clear(name);
  else await chrome.alarms.create(name, { when: Math.max(when, Date.now() + 500) });
}
