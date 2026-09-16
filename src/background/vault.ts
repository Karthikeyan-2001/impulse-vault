/** Vault commands. Every state change goes through the pure state machine, then `sync()`. */
import {
  MAX_COOLING_ITEMS,
  applyPayout,
  countCooling,
  createItem,
  crossedMilestones,
  findActiveDuplicate,
  isRemovable,
  payoutAmount,
  productKey,
  transition,
} from '../lib/state';
import { repo } from '../lib/storage';
import { canonicalizeUrl, domainOf, extractProductId } from '../lib/url';
import type { VaultDraft, VaultItem } from '../types';
import type { CreateResult } from '../types/messages';
import { scrapeUrl } from './offscreen';
import { packById, packFor } from './packs';
import { sync } from './sync';
import { hasHostAccess } from './tabs';

export async function createFromDraft(draft: VaultDraft): Promise<CreateResult> {
  const pack = await packFor(draft.url);
  const canonicalUrl = canonicalizeUrl(draft.url, pack);
  const domain = domainOf(draft.url);
  const productId = draft.productId ?? extractProductId(draft.url, pack);
  const lockEnabled = await hasHostAccess(draft.url);
  const now = Date.now();

  const result = await repo.mutateItems<CreateResult>((items) => {
    const list = Object.values(items);
    const dup = findActiveDuplicate(list, productKey({ domain, productId, url: canonicalUrl }));
    if (dup) return { status: 'duplicate', item: dup };
    if (countCooling(list) >= MAX_COOLING_ITEMS) {
      throw new Error(`Your vault holds ${MAX_COOLING_ITEMS} cooling items at once. Let one go first.`);
    }
    const item = createItem(
      { ...draft, productId, packId: pack?.id ?? draft.packId },
      { id: crypto.randomUUID(), now, canonicalUrl, domain, lockEnabled },
    );
    items[item.id] = item;
    return { status: 'created', item };
  });
  if (result.status === 'created') await sync();
  return result;
}

export async function removeItem(id: string): Promise<void> {
  await repo.mutateItems((items) => {
    const item = items[id];
    if (!item) return;
    if (!isRemovable(item, Date.now())) {
      throw new Error(
        item.state === 'cooling'
          ? "It's past the 5-minute undo window. You can let it go, or unlock it early."
          : 'This one stays: it’s part of your Saved Stack history.',
      );
    }
    delete items[id];
  });
  await sync();
}

export async function getItemOrThrow(id: string): Promise<VaultItem> {
  const item = await repo.getItem(id);
  if (!item) throw new Error('That item is no longer in the vault.');
  return item;
}

function need(items: Record<string, VaultItem>, id: string): VaultItem {
  const item = items[id];
  if (!item) throw new Error('That item is no longer in the vault.');
  return item;
}

export interface DeclineResult {
  item: VaultItem;
  totalMinor: number;
  declineCount: number;
  milestones: number[];
}

/** "No." The payout is immediate: item → declined, amount → its currency's stack, in one write. */
export async function decline(id: string, opts: { auto?: boolean } = {}): Promise<DeclineResult> {
  const now = Date.now();
  const settings = await repo.getSettings();
  const meta = await repo.getMeta();
  const res = await repo.mutateItemsAndStacks((items, stacks) => {
    const cur = need(items, id);
    const next = opts.auto
      ? transition(cur, { type: 'expire', now, expiryDays: settings.expiryDays })
      : transition(cur, { type: 'decline', now });
    items[id] = next;
    const amount = payoutAmount(next);
    const before = stacks[amount.currency]?.totalMinor ?? 0;
    const updated = applyPayout(stacks, next, now, opts.auto);
    const after = updated[amount.currency]?.totalMinor ?? before;
    const crossed =
      amount.currency === settings.displayCurrency
        ? crossedMilestones(before, after, settings.milestones, meta.celebrated[amount.currency])
        : [];
    return {
      stacks: updated,
      result: { item: next, totalMinor: after, declineCount: updated[amount.currency]?.declineCount ?? 0, milestones: crossed },
    };
  });
  if (res.milestones.length) {
    const currency = payoutAmount(res.item).currency;
    const top = res.milestones[res.milestones.length - 1]!;
    await repo.updateMeta((m) => ({
      ...m,
      celebrated: { ...m.celebrated, [currency]: [...(m.celebrated[currency] ?? []), ...res.milestones] },
      pendingCelebration: { currency, amountMinor: top },
    }));
  }
  await sync();
  return res;
}

/** "Yes." After the wait, buying is the system working. */
export async function release(id: string): Promise<VaultItem> {
  const now = Date.now();
  const item = await repo.mutateItems((items) => (items[id] = transition(need(items, id), { type: 'release', now })));
  await sync();
  return item;
}

/** The escape hatch. Deliberately expensive in the UI; here it just needs a real reason. */
export async function unlockEarly(id: string, reason: string): Promise<VaultItem> {
  const now = Date.now();
  const { unlockMinChars } = await repo.getSettings();
  const item = await repo.mutateItems(
    (items) => (items[id] = transition(need(items, id), { type: 'unlockEarly', now, reason, minChars: unlockMinChars })),
  );
  await sync();
  return item;
}

/** Best-effort price refresh (gate page, popup). Never throws for scrape failures. */
export async function refreshPrice(id: string): Promise<VaultItem | undefined> {
  const item = await getItemOrThrow(id);
  const ex = await scrapeUrl(item.url, await packById(item.packId));
  if (!ex) return item;
  return repo.mutateItems((items) => {
    const cur = items[id];
    if (!cur) return undefined;
    const next: VaultItem = {
      ...cur,
      ...(ex.price && ex.price.currency === cur.priceAtVault.currency ? { currentPrice: ex.price } : {}),
      ...(ex.inStock === false ? { soldOut: true } : ex.inStock === true ? { soldOut: false } : {}),
    };
    items[id] = next;
    return next;
  });
}
