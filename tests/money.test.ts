import { describe, expect, it } from 'vitest';
import {
  addMoney,
  formatAmountInput,
  formatMoney,
  joinPriceFragments,
  moneyDelta,
  parseAllPrices,
  parseAmount,
  parseMoneyInput,
  parsePrice,
  splitNumber,
} from '../src/lib/money';

const inr = (major: number) => ({ amountMinor: Math.round(major * 100), currency: 'INR' });

describe('parsePrice — the spec cases', () => {
  it('Indian lakh grouping: ₹1,29,900', () => {
    expect(parsePrice('₹1,29,900')).toEqual(inr(129900));
  });

  it('₹1,299.00', () => {
    expect(parsePrice('₹1,299.00')).toEqual(inr(1299));
  });

  it('$1,299.00', () => {
    expect(parsePrice('$1,299.00')).toEqual({ amountMinor: 129900, currency: 'USD' });
  });

  it('European: 1.299,00 €', () => {
    expect(parsePrice('1.299,00 €')).toEqual({ amountMinor: 129900, currency: 'EUR' });
  });

  it('Space-grouped Nordic: 1 299 kr', () => {
    expect(parsePrice('1 299 kr')).toEqual({ amountMinor: 129900, currency: 'SEK' });
  });

  it('non-breaking and narrow no-break spaces as group separators', () => {
    expect(parsePrice('1 299 kr')).toEqual({ amountMinor: 129900, currency: 'SEK' });
    expect(parsePrice('1 299,50 €')).toEqual({ amountMinor: 129950, currency: 'EUR' });
  });

  it('range takes the low end: ₹1,299 – ₹1,499', () => {
    expect(parsePrice('₹1,299 – ₹1,499')).toEqual(inr(1299));
    expect(parsePrice('₹1,499 - ₹1,299')).toEqual(inr(1299));
  });

  it('strikethrough MRP next to sale price → the smaller one', () => {
    expect(parsePrice('M.R.P.: ₹1,999.00 ₹1,299.00')).toEqual(inr(1299));
    expect(parsePrice('₹1,299 ₹1,999 35% off')).toEqual(inr(1299));
    // Fused textContent with no whitespace between the two prices.
    expect(parsePrice('₹1,29,900.00₹1,49,900.00')).toEqual(inr(129900));
  });

  it('prices split across <span> fragments', () => {
    // Amazon: <span class="a-price-symbol">₹</span><span class="a-price-whole">1,29,900<span class="a-price-decimal">.</span></span><span class="a-price-fraction">00</span>
    expect(parsePrice(joinPriceFragments(['₹', '1,29,900', '.', '00']))).toEqual(inr(129900));
    expect(parsePrice(joinPriceFragments(['$', '1,299', '.', '99']))).toEqual({ amountMinor: 129999, currency: 'USD' });
    // innerText of the same markup, with layout whitespace
    expect(parsePrice('₹\n1,29,900\n.\n00')).toEqual(inr(129900));
  });
});

describe('parsePrice — noise that must not win', () => {
  it('ignores "You save" and "off" amounts', () => {
    expect(parsePrice('₹1,299 You save: ₹700 (35%)')).toEqual(inr(1299));
    expect(parsePrice('₹1,299 · ₹200 off with coupon')).toEqual(inr(1299));
  });

  it('ignores delivery fees and EMI', () => {
    expect(parsePrice('₹1,299 + ₹40 delivery')).toEqual(inr(1299));
    expect(parsePrice('₹12,999 EMI from ₹612/month')).toEqual(inr(12999));
  });

  it('ignores bare numbers (ratings, counts, percentages)', () => {
    expect(parsePrice('4.5 out of 5 stars 1,234 ratings')).toBeNull();
    expect(parsePrice('-35% ₹1,299')).toEqual(inr(1299));
  });

  it('a number before a prefix symbol is not a postfix price', () => {
    expect(parseAllPrices('Qty 2 ₹1,299').map((p) => p.amountMinor)).toEqual([129900]);
  });

  it('Rs. and ISO codes', () => {
    expect(parsePrice('Rs. 2,499')).toEqual(inr(2499));
    expect(parsePrice('INR 2,499.50')).toEqual(inr(2499.5));
    expect(parsePrice('2 499 SEK')).toEqual({ amountMinor: 249900, currency: 'SEK' });
  });

  it('uses the hint to disambiguate $ and kr', () => {
    expect(parsePrice('$49.99', { currencyHint: 'CAD' })).toEqual({ amountMinor: 4999, currency: 'CAD' });
    expect(parsePrice('$49.99', { currencyHint: 'INR' })).toEqual({ amountMinor: 4999, currency: 'USD' });
    expect(parsePrice('499 kr', { currencyHint: 'NOK' })).toEqual({ amountMinor: 49900, currency: 'NOK' });
  });

  it('zero-decimal currencies', () => {
    expect(parsePrice('¥12,800')).toEqual({ amountMinor: 12800, currency: 'JPY' });
  });

  it('returns null for empty or priceless text', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('Currently unavailable')).toBeNull();
  });
});

describe('splitNumber', () => {
  it.each([
    ['1,29,900', 'INR', '129900', ''],
    ['1,299', 'INR', '1299', ''],
    ['1.299', 'EUR', '1299', ''],
    ['12,50', 'EUR', '12', '50'],
    ['1.5', 'USD', '1', '5'],
    ['1.299.000,99', 'EUR', '1299000', '99'],
    ['1 299', 'SEK', '1299', ''],
  ])('%s (%s)', (raw, cur, int, frac) => {
    expect(splitNumber(raw, cur)).toEqual({ int, frac });
  });
});

describe('parseAmount (machine formats)', () => {
  it('parses JSON-LD style values without float drift', () => {
    expect(parseAmount('1299.00', 'INR')).toEqual(inr(1299));
    expect(parseAmount(1299.99, 'USD')).toEqual({ amountMinor: 129999, currency: 'USD' });
    expect(parseAmount('0.29', 'USD')).toEqual({ amountMinor: 29, currency: 'USD' });
    expect(parseAmount('1,29,900', 'INR')).toEqual(inr(129900));
    expect(parseAmount('nope', 'INR')).toBeNull();
    expect(parseAmount(0, 'INR')).toBeNull();
  });
});

describe('parseMoneyInput (user typing)', () => {
  it('accepts bare numbers in the item currency', () => {
    expect(parseMoneyInput('1299', 'INR')).toEqual(inr(1299));
    expect(parseMoneyInput('1,299.50', 'INR')).toEqual(inr(1299.5));
    expect(parseMoneyInput('₹ 2,499', 'INR')).toEqual(inr(2499));
    expect(parseMoneyInput('', 'INR')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('uses lakh grouping for rupees and drops .00', () => {
    expect(formatMoney(inr(129900))).toBe('₹1,29,900');
    expect(formatMoney(inr(2499))).toBe('₹2,499');
    expect(formatMoney(inr(2499.5))).toBe('₹2,499.50');
  });

  it('formats other currencies', () => {
    expect(formatMoney({ amountMinor: 129900, currency: 'USD' }, { locale: 'en-US' })).toBe('$1,299');
    expect(formatMoney({ amountMinor: 12800, currency: 'JPY' }, { locale: 'en-US' })).toBe('¥12,800');
  });

  it('formats an input value without the symbol, and reads it back', () => {
    expect(formatAmountInput(inr(129900))).toBe('1,29,900');
    expect(formatAmountInput(inr(1299.5))).toBe('1,299.50');
    expect(formatAmountInput({ amountMinor: 129900, currency: 'EUR' })).toBe('1,299');
    for (const m of [inr(129900), inr(1299.5), { amountMinor: 129950, currency: 'EUR' }]) {
      expect(parseMoneyInput(formatAmountInput(m), m.currency)).toEqual(m);
    }
  });
});

describe('arithmetic', () => {
  it('delta is null across currencies — no invented exchange rates', () => {
    expect(moneyDelta(inr(1000), inr(600))).toBe(-40000);
    expect(moneyDelta(inr(1000), { amountMinor: 1, currency: 'USD' })).toBeNull();
  });

  it('refuses to add across currencies', () => {
    expect(addMoney(inr(1), inr(2))).toEqual(inr(3));
    expect(() => addMoney(inr(1), { amountMinor: 1, currency: 'USD' })).toThrow();
  });
});
