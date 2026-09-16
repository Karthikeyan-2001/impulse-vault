import { describe, expect, it } from 'vitest';
import { declineCopy, interstitialLine, priceDeltaCopy, releaseCopy } from '../src/lib/copy';
import { HOUR } from '../src/lib/time';
import type { VaultItem } from '../src/types';

const inr = (r: number) => ({ amountMinor: r * 100, currency: 'INR' });

describe('price delta copy', () => {
  it('is positive in both directions and never urgent', () => {
    expect(priceDeltaCopy(inr(2499), inr(2099))?.text).toBe('Price dropped ₹400 since you vaulted this.');
    expect(priceDeltaCopy(inr(2499), inr(2899))?.text).toBe('Price went up ₹400 — good thing you waited?');
    expect(priceDeltaCopy(inr(2499), inr(2499))?.kind).toBe('same');
  });

  it('refuses to compare across currencies or unknowns', () => {
    expect(priceDeltaCopy(inr(1), { amountMinor: 1, currency: 'USD' })).toBeNull();
    expect(priceDeltaCopy(inr(1), undefined)).toBeNull();
  });

  it('shaming words never appear', () => {
    const all = [
      priceDeltaCopy(inr(2499), inr(2099))!.text,
      priceDeltaCopy(inr(2499), inr(2899))!.text,
      declineCopy(inr(2499)),
      releaseCopy({ cooldownHours: 72 } as VaultItem),
    ].join(' ');
    expect(all).not.toMatch(/hurry|last chance|only \d+ left|weak|guilt|shame|should(n't| not) have|failed/i);
  });
});

describe('voice samples from the spec', () => {
  it('decline payout', () => {
    expect(declineCopy(inr(2499))).toBe('₹2,499 stays yours.');
  });

  it('release', () => {
    expect(releaseCopy({ cooldownHours: 72 } as VaultItem)).toBe('Go get it. Three days of wanting is a real signal.');
    expect(releaseCopy({ cooldownHours: 168 } as VaultItem)).toBe('Go get it. A week of wanting is a real signal.');
  });

  it('interstitial', () => {
    const now = new Date(2026, 8, 17, 15).getTime(); // Thursday
    const vaultedAt = new Date(2026, 8, 15, 20).getTime(); // Tuesday evening
    const item = { vaultedAt, unlockAt: vaultedAt + 72 * HOUR } as VaultItem;
    expect(interstitialLine(item, now)).toBe('You wanted this on Tuesday. Still 29 hours to go.');
  });
});
