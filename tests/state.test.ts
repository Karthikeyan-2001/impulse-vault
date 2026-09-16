import { describe, expect, it } from 'vitest';
import {
  MAX_COOLING_ITEMS,
  TransitionError,
  UNDO_WINDOW_MS,
  applyPayout,
  canTransition,
  countCooling,
  createItem,
  crossedMilestones,
  findActiveDuplicate,
  isRemovable,
  nextMilestone,
  payoutAmount,
  planSweep,
  productKey,
  sortCooling,
  transition,
} from '../src/lib/state';
import { DAY, HOUR } from '../src/lib/time';
import type { VaultDraft, VaultItem } from '../src/types';

const T0 = new Date(2026, 8, 15, 10).getTime();

const draft = (over: Partial<VaultDraft> = {}): VaultDraft => ({
  url: 'https://www.amazon.in/dp/B0CX23V2ZK',
  title: '  Noise-cancelling headphones ',
  price: { amountMinor: 249900, currency: 'INR' },
  note: ' my old ones broke ',
  cooldownHours: 72,
  lockdown: false,
  confidence: 'high',
  productId: 'B0CX23V2ZK',
  packId: 'amazon.in',
  ...over,
});

const make = (id = 'a', over: Partial<VaultDraft> = {}, now = T0): VaultItem =>
  createItem(draft(over), {
    id,
    now,
    canonicalUrl: 'https://www.amazon.in/dp/B0CX23V2ZK',
    domain: 'amazon.in',
    lockEnabled: true,
  });

describe('createItem', () => {
  it('starts cooling with unlockAt as the only timer truth', () => {
    const item = make();
    expect(item.state).toBe('cooling');
    expect(item.unlockAt).toBe(T0 + 72 * HOUR);
    expect(item.title).toBe('Noise-cancelling headphones');
    expect(item.note).toBe('my old ones broke');
  });

  it('drops an empty note and rejects bad input', () => {
    expect(make('a', { note: '   ' }).note).toBeUndefined();
    expect(() => make('a', { title: ' ' })).toThrow();
    expect(() => make('a', { price: { amountMinor: 0, currency: 'INR' } })).toThrow();
    expect(() => make('a', { cooldownHours: 0 })).toThrow();
  });
});

describe('transitions', () => {
  it('cooling → ripe only once the timer has run out', () => {
    const item = make();
    expect(() => transition(item, { type: 'ripen', now: item.unlockAt - 1 })).toThrow(TransitionError);
    expect(transition(item, { type: 'ripen', now: item.unlockAt }).state).toBe('ripe');
  });

  it('ripe → released (yes) is a plain success, no early-unlock mark', () => {
    const ripe = transition(make(), { type: 'ripen', now: T0 + 72 * HOUR });
    const released = transition(ripe, { type: 'release', now: T0 + 73 * HOUR });
    expect(released.state).toBe('released');
    expect(released.decidedAt).toBe(T0 + 73 * HOUR);
    expect(released.earlyUnlock).toBeUndefined();
  });

  it('ripe → declined', () => {
    const ripe = transition(make(), { type: 'ripen', now: T0 + 72 * HOUR });
    expect(transition(ripe, { type: 'decline', now: T0 + 80 * HOUR }).state).toBe('declined');
  });

  it('cooling → declined ("let it go" before the timer)', () => {
    expect(transition(make(), { type: 'decline', now: T0 + HOUR }).state).toBe('declined');
  });

  it('cooling → released early needs a real reason', () => {
    const item = make();
    const ev = { type: 'unlockEarly' as const, now: T0 + HOUR, minChars: 25 };
    expect(() => transition(item, { ...ev, reason: 'because' })).toThrow(/25 characters/);
    expect(() => transition(item, { ...ev, reason: '                              ' })).toThrow();
    const out = transition(item, { ...ev, reason: 'My laptop died and I have a deadline tomorrow' });
    expect(out.state).toBe('released');
    expect(out.earlyUnlock?.reason).toMatch(/deadline/);
  });

  it('ripe → expired only after the expiry window', () => {
    const ripe = transition(make(), { type: 'ripen', now: T0 + 72 * HOUR });
    expect(() => transition(ripe, { type: 'expire', now: ripe.unlockAt + 13 * DAY, expiryDays: 14 })).toThrow();
    expect(transition(ripe, { type: 'expire', now: ripe.unlockAt + 14 * DAY, expiryDays: 14 }).state).toBe('expired');
  });

  it('final states are final', () => {
    const declined = transition(make(), { type: 'decline', now: T0 });
    for (const type of ['ripen', 'release', 'unlockEarly', 'decline', 'expire'] as const) {
      expect(canTransition(declined, type)).toBe(false);
    }
    expect(() => transition(declined, { type: 'release', now: T0 })).toThrow(TransitionError);
  });

  it('cannot release a cooling item without the early-unlock path', () => {
    expect(() => transition(make(), { type: 'release', now: T0 })).toThrow(TransitionError);
  });

  it('does not mutate its input', () => {
    const item = make();
    const frozen = Object.freeze({ ...item });
    expect(() => transition(frozen, { type: 'decline', now: T0 })).not.toThrow();
    expect(frozen.state).toBe('cooling');
  });
});

describe('planSweep — wall clock is the only truth', () => {
  it('ripens everything overdue, however long the browser was closed', () => {
    const a = make('a');
    const b = make('b', { cooldownHours: 24 });
    const c = make('c', { cooldownHours: 168 });
    const plan = planSweep([a, b, c], T0 + 80 * HOUR, 14);
    expect(plan.toRipen.sort()).toEqual(['a', 'b']);
    expect(plan.toExpire).toEqual([]);
  });

  it('expires ripe items ignored past the window', () => {
    const ripe = transition(make('a'), { type: 'ripen', now: T0 + 72 * HOUR });
    expect(planSweep([ripe], ripe.unlockAt + 15 * DAY, 14).toExpire).toEqual(['a']);
  });
});

describe('dedupe', () => {
  it('keys on product ID when known, canonical URL otherwise', () => {
    expect(productKey(make())).toBe('amazon.in:B0CX23V2ZK');
    expect(productKey({ domain: 'x.com', url: 'https://x.com/p' })).toBe('https://x.com/p');
  });

  it('finds an active duplicate but ignores finished ones', () => {
    const a = make('a');
    expect(findActiveDuplicate([a], productKey(a))?.id).toBe('a');
    const declined = transition(a, { type: 'decline', now: T0 });
    expect(findActiveDuplicate([declined], productKey(a))).toBeUndefined();
  });

  it('counts cooling items against the cap', () => {
    expect(MAX_COOLING_ITEMS).toBe(200);
    expect(countCooling([make('a'), make('b'), transition(make('c'), { type: 'decline', now: T0 })])).toBe(2);
  });
});

describe('removal is not an escape hatch', () => {
  it('cooling items are removable only inside the undo window', () => {
    const item = make();
    expect(isRemovable(item, T0 + UNDO_WINDOW_MS - 1)).toBe(true);
    expect(isRemovable(item, T0 + UNDO_WINDOW_MS)).toBe(false);
  });

  it('declined items are receipts and stay', () => {
    expect(isRemovable(transition(make(), { type: 'decline', now: T0 }), T0 + DAY)).toBe(false);
  });
});

describe('Saved Stack', () => {
  it('pays out the ripen price when known, else the vault price', () => {
    const item = make();
    expect(payoutAmount(item).amountMinor).toBe(249900);
    expect(payoutAmount({ ...item, priceAtRipen: { amountMinor: 199900, currency: 'INR' } }).amountMinor).toBe(199900);
  });

  it('keeps separate stacks per currency and is idempotent per item', () => {
    const a = transition(make('a'), { type: 'decline', now: T0 });
    const b = transition(make('b', { price: { amountMinor: 4999, currency: 'USD' } }), { type: 'decline', now: T0 });
    let stacks = applyPayout({}, a, T0);
    stacks = applyPayout(stacks, a, T0); // double-click
    stacks = applyPayout(stacks, b, T0, true);
    expect(stacks.INR).toMatchObject({ totalMinor: 249900, declineCount: 1 });
    expect(stacks.USD).toMatchObject({ totalMinor: 4999, declineCount: 1 });
    expect(stacks.USD!.history[0]!.auto).toBe(true);
  });

  it('reports newly crossed milestones once', () => {
    const ms = [5_000, 10_000, 25_000].map((r) => ({ amountMinor: r * 100 }));
    expect(crossedMilestones(400_000, 1_100_000, ms)).toEqual([500_000, 1_000_000]);
    expect(crossedMilestones(400_000, 1_100_000, ms, [500_000])).toEqual([1_000_000]);
    expect(crossedMilestones(600_000, 700_000, ms)).toEqual([]);
    expect(nextMilestone(600_000, ms)?.amountMinor).toBe(1_000_000);
  });
});

describe('sorting', () => {
  it('cooling tab sorts soonest first', () => {
    const later = make('later', { cooldownHours: 168 });
    const sooner = make('sooner', { cooldownHours: 24 });
    expect(sortCooling([later, sooner]).map((i) => i.id)).toEqual(['sooner', 'later']);
  });
});
