/**
 * The VaultItem state machine and Saved Stack arithmetic. Pure: no chrome.*, no Date.now().
 *
 *   cooling ──ripen──▶ ripe ──release──▶ released      (buying after the wait = success)
 *      │                 │ └──decline──▶ declined      (payout)
 *      │                 └───expire───▶ expired        (soft auto-decline, payout)
 *      ├──unlockEarly (reason required)──▶ released
 *      └──decline ("let it go" early)────▶ declined    (payout)
 */
import type { Money } from './money';
import { computeUnlockAt, isDue, isExpired } from './time';
import type { Milestone, Stacks, VaultDraft, VaultItem, VaultState } from '../types';

export const MAX_COOLING_ITEMS = 200;
/** A cooling item can be removed outright only this soon after vaulting (misclick insurance). */
export const UNDO_WINDOW_MS = 5 * 60_000;

export class TransitionError extends Error {
  constructor(
    message: string,
    readonly from: VaultState,
    readonly event: string,
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

export type VaultEvent =
  | { type: 'ripen'; now: number }
  | { type: 'release'; now: number }
  | { type: 'unlockEarly'; now: number; reason: string; minChars: number }
  | { type: 'decline'; now: number }
  | { type: 'expire'; now: number; expiryDays: number };

const ALLOWED: Record<VaultEvent['type'], VaultState[]> = {
  ripen: ['cooling'],
  release: ['ripe'],
  unlockEarly: ['cooling'],
  decline: ['cooling', 'ripe'],
  expire: ['ripe'],
};

export function canTransition(item: VaultItem, type: VaultEvent['type']): boolean {
  return ALLOWED[type].includes(item.state);
}

export function isActive(item: VaultItem): boolean {
  return item.state === 'cooling' || item.state === 'ripe';
}

export function isFinal(state: VaultState): boolean {
  return state === 'released' || state === 'declined' || state === 'expired';
}

export function transition(item: VaultItem, event: VaultEvent): VaultItem {
  if (!canTransition(item, event.type)) {
    throw new TransitionError(`Cannot ${event.type} an item that is ${item.state}`, item.state, event.type);
  }
  switch (event.type) {
    case 'ripen':
      if (!isDue(item.unlockAt, event.now)) {
        throw new TransitionError('Timer has not run out yet', item.state, event.type);
      }
      return { ...item, state: 'ripe' };
    case 'release':
      return { ...item, state: 'released', decidedAt: event.now };
    case 'unlockEarly': {
      const reason = event.reason.trim();
      if (reason.length < event.minChars) {
        throw new TransitionError(
          `An early unlock needs a reason of at least ${event.minChars} characters`,
          item.state,
          event.type,
        );
      }
      return { ...item, state: 'released', decidedAt: event.now, earlyUnlock: { at: event.now, reason } };
    }
    case 'decline':
      return { ...item, state: 'declined', decidedAt: event.now };
    case 'expire':
      if (!isExpired(item.unlockAt, event.now, event.expiryDays)) {
        throw new TransitionError('Not ignored long enough to expire', item.state, event.type);
      }
      return { ...item, state: 'expired', decidedAt: event.now };
  }
}

export interface CreateContext {
  id: string;
  now: number;
  canonicalUrl: string;
  domain: string;
  lockEnabled: boolean;
}

export function createItem(draft: VaultDraft, ctx: CreateContext): VaultItem {
  const title = draft.title.trim();
  if (!title) throw new Error('A title is required');
  if (!Number.isInteger(draft.price.amountMinor) || draft.price.amountMinor <= 0) {
    throw new Error('A price above zero is required');
  }
  if (!(draft.cooldownHours > 0)) throw new Error('Cooldown must be positive');
  const note = draft.note?.trim();
  return {
    id: ctx.id,
    url: ctx.canonicalUrl,
    domain: ctx.domain,
    title: title.slice(0, 300),
    imageUrl: draft.imageUrl || undefined,
    priceAtVault: draft.price,
    state: 'cooling',
    vaultedAt: ctx.now,
    unlockAt: computeUnlockAt(ctx.now, draft.cooldownHours),
    note: note ? note.slice(0, 280) : undefined,
    extractionConfidence: draft.confidence,
    cooldownHours: draft.cooldownHours,
    productId: draft.productId,
    packId: draft.packId,
    lockdown: draft.lockdown,
    lockEnabled: ctx.lockEnabled,
  };
}

/** Dedupe key: the retailer's product ID when we know it, else the canonical URL. */
export function productKey(item: Pick<VaultItem, 'domain' | 'productId' | 'url'>): string {
  return item.productId ? `${item.domain}:${item.productId}` : item.url;
}

/** An active (cooling/ripe) item for the same product, if any. */
export function findActiveDuplicate(
  items: Iterable<VaultItem>,
  key: string,
): VaultItem | undefined {
  for (const item of items) if (isActive(item) && productKey(item) === key) return item;
  return undefined;
}

export function countCooling(items: Iterable<VaultItem>): number {
  let n = 0;
  for (const item of items) if (item.state === 'cooling') n++;
  return n;
}

/**
 * Removal is not an escape hatch: a cooling item can only be removed inside the undo window
 * (after that the choices are "let it go" or the deliberate early unlock). Declined/expired
 * items are the Stack's receipts and stay. Released items can be tidied away.
 */
export function isRemovable(item: VaultItem, now: number): boolean {
  if (item.state === 'cooling') return now - item.vaultedAt < UNDO_WINDOW_MS;
  return item.state === 'released';
}

export interface SweepPlan {
  toRipen: string[];
  toExpire: string[];
}

/** What the reconciliation sweep should do right now. Wall clock is the only truth. */
export function planSweep(items: Iterable<VaultItem>, now: number, expiryDays: number): SweepPlan {
  const plan: SweepPlan = { toRipen: [], toExpire: [] };
  for (const item of items) {
    if (item.state === 'cooling' && isDue(item.unlockAt, now)) {
      // Browser closed for weeks? It ripens now; it gets its full verdict window from here.
      plan.toRipen.push(item.id);
    } else if (item.state === 'ripe' && isExpired(item.unlockAt, now, expiryDays)) {
      plan.toExpire.push(item.id);
    }
  }
  return plan;
}

/** What a "no" is worth: the price when the timer ran out, else the price when vaulted. */
export function payoutAmount(item: VaultItem): Money {
  return item.priceAtRipen ?? item.priceAtVault;
}

/** Add a declined/expired item to its currency's stack. Idempotent per item. */
export function applyPayout(stacks: Stacks, item: VaultItem, now: number, auto = false): Stacks {
  const amount = payoutAmount(item);
  const current = stacks[amount.currency] ?? {
    totalMinor: 0,
    currency: amount.currency,
    declineCount: 0,
    history: [],
  };
  if (current.history.some((h) => h.itemId === item.id)) return stacks;
  return {
    ...stacks,
    [amount.currency]: {
      ...current,
      totalMinor: current.totalMinor + amount.amountMinor,
      declineCount: current.declineCount + 1,
      history: [
        ...current.history,
        { itemId: item.id, amountMinor: amount.amountMinor, at: now, ...(auto ? { auto: true } : {}) },
      ],
    },
  };
}

/** Thresholds crossed going from `before` to `after` that haven't been celebrated. */
export function crossedMilestones(
  beforeMinor: number,
  afterMinor: number,
  milestones: Milestone[],
  celebrated: number[] = [],
): number[] {
  return milestones
    .map((m) => m.amountMinor)
    .filter((t) => beforeMinor < t && afterMinor >= t && !celebrated.includes(t))
    .sort((a, b) => a - b);
}

export function nextMilestone(totalMinor: number, milestones: Milestone[]): Milestone | undefined {
  return [...milestones].sort((a, b) => a.amountMinor - b.amountMinor).find((m) => m.amountMinor > totalMinor);
}

export function sortCooling(items: VaultItem[]): VaultItem[] {
  return items.filter((i) => i.state === 'cooling').sort((a, b) => a.unlockAt - b.unlockAt);
}

export function sortRipe(items: VaultItem[]): VaultItem[] {
  return items.filter((i) => i.state === 'ripe').sort((a, b) => a.unlockAt - b.unlockAt);
}
