/**
 * Ripe notifications. One ripe item → "Do you still want this?" with [Yes, buy it] [No, save ₹X].
 * Several at once (browser closed all weekend) → one summary, never a burst.
 * "No" from the notification completes the decline with no UI at all: one click, instant payout.
 */
import { declineCopy, itemDelta, latestPrice } from '../lib/copy';
import { formatMoney } from '../lib/money';
import { payoutAmount } from '../lib/state';
import { repo } from '../lib/storage';
import { isInQuietHours, quietHoursEnd } from '../lib/time';
import type { Settings, VaultItem } from '../types';
import { ALARM, scheduleAt } from './alarms';

const ICON = 'icons/icon-128.png';
const RIPE = 'ripe:';
const SUMMARY = 'ripe-summary';
const PAYOUT = 'payout:';

/** Notify about ripe items not yet notified. Respects the on/off switch and quiet hours. */
export async function notifyRipe(settings: Settings): Promise<void> {
  const now = Date.now();
  const pending = (await repo.getItemList()).filter((i) => i.state === 'ripe' && !i.notifiedAt);
  if (!pending.length) return;

  if (settings.notifications.enabled && isInQuietHours(now, settings.notifications.quietHours)) {
    await scheduleAt(ALARM.quiet, quietHoursEnd(now, settings.notifications.quietHours));
    return; // they stay un-notified; the quiet alarm (or a later sweep) picks them up
  }
  if (settings.notifications.enabled) {
    if (pending.length === 1) await showSingle(pending[0]!);
    else await showSummary(pending);
  }
  const ids = new Set(pending.map((i) => i.id));
  await repo.mutateItems((items) => {
    for (const id of ids) if (items[id]) items[id] = { ...items[id]!, notifiedAt: now };
  });
}

async function showSingle(item: VaultItem): Promise<void> {
  const payout = formatMoney(payoutAmount(item));
  const delta = itemDelta(item);
  const soldOut = item.soldOut === true;
  await chrome.notifications.create(RIPE + item.id, {
    type: 'basic',
    iconUrl: ICON,
    title: soldOut ? 'This sold out while you waited.' : 'Do you still want this?',
    message: `${item.title} — ${formatMoney(latestPrice(item))}`,
    contextMessage: soldOut ? 'Let it go and it still counts. The money wasn’t spent.' : delta && delta.kind !== 'same' ? delta.text : item.note ? `You wrote: “${item.note}”` : undefined,
    buttons: soldOut ? [{ title: 'Check the page' }, { title: `Let it go, save ${payout}` }] : [{ title: 'Yes, buy it' }, { title: `No, save ${payout}` }],
    requireInteraction: true,
    priority: 1,
  });
}

async function showSummary(items: VaultItem[]): Promise<void> {
  // 'basic', not 'list': native notifications (Windows, macOS) drop list items.
  const names = items.slice(0, 3).map((i) => i.title.slice(0, 40));
  const more = items.length > 3 ? ` and ${items.length - 3} more` : '';
  await chrome.notifications.create(SUMMARY, {
    type: 'basic',
    iconUrl: ICON,
    title: `${items.length} things finished cooling off. Still want them?`,
    message: `${names.join(' · ')}${more}`,
    buttons: [{ title: 'Decide now' }],
    requireInteraction: true,
    priority: 1,
  });
}

export async function showPayout(item: VaultItem, totalMinor: number): Promise<void> {
  const amount = payoutAmount(item);
  await chrome.notifications.create(PAYOUT + item.id, {
    type: 'basic',
    iconUrl: ICON,
    title: declineCopy(amount),
    message: `Your Saved Stack: ${formatMoney({ amountMinor: totalMinor, currency: amount.currency })}.`,
    priority: 0,
  });
}

export async function showMilestone(amountMinor: number, currency: string, equivalence?: string): Promise<void> {
  await chrome.notifications.create(`milestone:${currency}:${amountMinor}`, {
    type: 'basic',
    iconUrl: ICON,
    title: `${formatMoney({ amountMinor, currency })} kept.`,
    message: equivalence ? `That’s ${equivalence}. All of it stayed yours.` : 'All of it stayed yours. Open the popup to see the stack.',
    priority: 0,
  });
}

export interface NotificationActions {
  release(id: string): Promise<void>;
  decline(id: string): Promise<void>;
  openItem(id: string): Promise<void>;
  review(): Promise<void>;
}

export function wireNotifications(actions: NotificationActions): void {
  chrome.notifications.onButtonClicked.addListener((nid, index) => {
    void chrome.notifications.clear(nid);
    if (nid === SUMMARY) return void actions.review();
    if (!nid.startsWith(RIPE)) return;
    const id = nid.slice(RIPE.length);
    void repo.getItem(id).then((item) => {
      if (!item || item.state !== 'ripe') return;
      if (index === 1) return actions.decline(id);
      return item.soldOut ? actions.openItem(id) : actions.release(id);
    });
  });
  chrome.notifications.onClicked.addListener((nid) => {
    void chrome.notifications.clear(nid);
    if (nid === SUMMARY || nid.startsWith(RIPE) || nid.startsWith('milestone:') || nid.startsWith(PAYOUT)) void actions.review();
  });
}

export async function clearItemNotification(id: string): Promise<void> {
  await chrome.notifications.clear(RIPE + id);
}
