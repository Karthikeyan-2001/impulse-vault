/**
 * Product copy that depends on data. Voice: warm, plain, slightly dry. Never moralise, never
 * manufacture urgency — that's the psychology this product exists to defeat.
 */
import { formatMoney, moneyDelta, type Money } from './money';
import { describeWhen, formatRemaining, remainingMs } from './time';
import type { VaultItem } from '../types';

export type DeltaKind = 'drop' | 'rise' | 'same';

export interface PriceDelta {
  kind: DeltaKind;
  amount?: Money;
  text: string;
}

/** Neutral-to-positive either way. Returns null when we can't compare (unknown or other currency). */
export function priceDeltaCopy(from: Money, to: Money | undefined): PriceDelta | null {
  if (!to) return null;
  const d = moneyDelta(from, to);
  if (d === null) return null;
  if (d === 0) return { kind: 'same', text: 'Same price as when you vaulted it.' };
  const amount = { amountMinor: Math.abs(d), currency: from.currency };
  return d < 0
    ? { kind: 'drop', amount, text: `Price dropped ${formatMoney(amount)} since you vaulted this.` }
    : { kind: 'rise', amount, text: `Price went up ${formatMoney(amount)} — good thing you waited?` };
}

/** The freshest price we know for an item. */
export function latestPrice(item: VaultItem): Money {
  return item.currentPrice ?? item.priceAtRipen ?? item.priceAtVault;
}

export function itemDelta(item: VaultItem): PriceDelta | null {
  const latest = item.currentPrice ?? item.priceAtRipen;
  return latest ? priceDeltaCopy(item.priceAtVault, latest) : null;
}

export const declineCopy = (amount: Money) => `${formatMoney(amount)} stays yours.`;

export const RELEASE_COPY = 'Go get it. Three days of wanting is a real signal.';

export function releaseCopy(item: VaultItem): string {
  if (item.cooldownHours === 72) return RELEASE_COPY;
  const span = item.cooldownHours === 24 ? 'A day' : item.cooldownHours === 168 ? 'A week' : `${item.cooldownHours} hours`;
  return `Go get it. ${span} of wanting is a real signal.`;
}

/** "You wanted this on Tuesday. Still 41 hours to go." */
export function interstitialLine(item: VaultItem, now: number): string {
  const left = formatRemaining(remainingMs(item.unlockAt, now));
  return `You wanted this ${describeWhen(item.vaultedAt, now)}. Still ${left} to go.`;
}

export const lockedCopy = (backIn: string) => `Locked. Back in ${backIn}.`;
