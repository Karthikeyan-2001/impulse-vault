/**
 * Derived state. After any change to items, bring everything that is a *function of* the items
 * back in line: per-item alarms, DNR rules, the toolbar badge. Idempotent; safe to call often.
 */
import { repo } from '../lib/storage';
import { ensureSweepAlarm, syncItemAlarms } from './alarms';

export async function updateBadge(count?: number): Promise<void> {
  const ripe = count ?? (await repo.getItemList()).filter((i) => i.state === 'ripe').length;
  await chrome.action.setBadgeText({ text: ripe ? String(ripe) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#B8892D' });
  await chrome.action.setBadgeTextColor?.({ color: '#1D1B22' });
}

type Hook = () => Promise<void>;
const hooks: Hook[] = [];

/** Feature modules (DNR rules) register here so sync() stays the single reconciliation point. */
export function onSync(hook: Hook): void {
  hooks.push(hook);
}

export async function sync(): Promise<void> {
  const items = await repo.getItemList();
  await Promise.all([
    ensureSweepAlarm(),
    syncItemAlarms(items),
    updateBadge(items.filter((i) => i.state === 'ripe').length),
  ]);
  for (const hook of hooks) await hook();
}
