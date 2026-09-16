import { describe, expect, it } from 'vitest';
import amazonPack from '../sites/amazon.in.json';
import { PRIORITY, buildDynamicRules, buildSessionRules, cartRegex, cartUrlFilters, finaliseRules, gateMatches, gateRegex, gateUrlFilter, matches } from '../src/lib/rules';
import type { SitePack, VaultItem } from '../src/types';

const amazon = amazonPack as SitePack;
const NOW = 1_800_000_000_000;

const item = (over: Partial<VaultItem> = {}): VaultItem => ({
  id: 'item-1',
  url: 'https://www.amazon.in/dp/B09XS7JWHH',
  domain: 'amazon.in',
  title: 'Headphones',
  priceAtVault: { amountMinor: 100, currency: 'INR' },
  state: 'cooling',
  vaultedAt: NOW,
  unlockAt: NOW + 72 * 3600_000,
  extractionConfidence: 'high',
  cooldownHours: 72,
  productId: 'B09XS7JWHH',
  packId: 'amazon.in',
  lockdown: false,
  lockEnabled: true,
  ...over,
});

describe('gate regex — matches the product however the URL is dressed up', () => {
  const re = gateRegex(item(), amazon);
  it.each([
    'https://www.amazon.in/dp/B09XS7JWHH',
    'https://www.amazon.in/Sony-WH-1000XM5-Cancelling/dp/B09XS7JWHH/ref=sr_1_3?crid=2&keywords=sony&tag=aff-21',
    'https://www.amazon.in/-/hi/Sony/dp/B09XS7JWHH?th=1&psc=1',
    'https://amazon.in/gp/product/B09XS7JWHH',
    'https://m.amazon.in/gp/aw/d/B09XS7JWHH/',
    'https://www.amazon.in/dp/B09XS7JWHH#customerReviews',
  ])('gates %s', (url) => expect(matches(re, url)).toBe(true));

  it.each([
    'https://www.amazon.in/dp/B09XS7JWHX', // another product
    'https://www.amazon.in/dp/B09XS7JWHH0', // longer id
    'https://www.amazon.in/s?k=B09XS7JWHH', // a search for it
    'https://www.notamazon.in/dp/B09XS7JWHH',
    'https://www.amazon.com/dp/B09XS7JWHH', // different store
    'https://www.amazon.in/gp/cart/view.html',
  ])('leaves %s alone', (url) => expect(matches(re, url)).toBe(false));

  it('falls back to host + path for sites without a pack', () => {
    const re = gateRegex({ url: 'https://shop.example.com/lamps/desk-lamp', domain: 'shop.example.com' });
    expect(matches(re, 'https://shop.example.com/lamps/desk-lamp?utm_source=ig')).toBe(true);
    expect(matches(re, 'https://www.shop.example.com/lamps/desk-lamp/')).toBe(true);
    expect(matches(re, 'https://shop.example.com/lamps/desk-lamp-pro')).toBe(false);
    expect(matches(re, 'https://shop.example.com/lamps')).toBe(false);
  });

  it('keeps identifying query params for query-addressed products', () => {
    const re = gateRegex({ url: 'https://shop.example.com/product?id=42', domain: 'shop.example.com' });
    expect(matches(re, 'https://shop.example.com/product?id=42&utm_medium=x')).toBe(true);
    expect(matches(re, 'https://shop.example.com/product?id=43')).toBe(false);
  });
});

describe('cart regex', () => {
  const re = cartRegex('amazon.in', amazon);
  it.each([
    'https://www.amazon.in/gp/cart/view.html?ref_=nav_cart',
    'https://www.amazon.in/cart/smart-wagon?newItems=abc',
    'https://www.amazon.in/gp/buy/spc/handlers/display.html',
    'https://www.amazon.in/checkout/entry/buynow',
    'https://www.amazon.in/-/hi/gp/cart/view.html',
  ])('blocks %s', (url) => expect(matches(re, url)).toBe(true));

  it.each([
    'https://www.amazon.in/dp/B09XS7JWHH',
    'https://www.amazon.in/Cart-Organiser-Shelf/dp/B000000001',
    'https://www.amazon.in/s?k=cart',
  ])('allows %s', (url) => expect(matches(re, url)).toBe(false));

  it('uses the spec defaults without a pack', () => {
    const generic = cartRegex('shop.example.com');
    expect(matches(generic, 'https://shop.example.com/checkout/init?x=1')).toBe(true);
    expect(matches(generic, 'https://shop.example.com/cart')).toBe(true);
    expect(matches(generic, 'https://shop.example.com/en-in/cart')).toBe(true);
    expect(matches(generic, 'https://shop.example.com/tshirts/brand/123/buy')).toBe(false);
  });
});

describe('rule sets', () => {
  const inputs = (items: VaultItem[]) => ({
    items,
    packFor: () => amazon,
    base: 'chrome-extension://abc/',
    extensionId: 'abc',
  });

  it('one gate rule per locked item, one cart rule per domain', () => {
    const rules = finaliseRules(buildDynamicRules(
      inputs([
        item(),
        item({ id: 'item-2', productId: 'B000000002' }),
        item({ id: 'ripe', state: 'ripe' }),
        item({ id: 'nolock', lockEnabled: false, productId: 'B000000003' }),
      ]),
    ), () => false);
    const gates = rules.filter((r) => r.priority === PRIORITY.gate);
    const carts = rules.filter((r) => r.priority === PRIORITY.cart);
    expect(gates).toHaveLength(2);
    expect(carts).toHaveLength(1);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    expect(gates[0]!.action.redirect?.regexSubstitution).toBe('chrome-extension://abc/pages/gate/index.html?id=item-1#\\0');
    expect(gates[0]!.condition.resourceTypes).toEqual(['main_frame']);
    expect(gates[0]!.condition.excludedInitiatorDomains).toEqual(['abc']);
  });

  it('no cooling items → no rules at all', () => {
    expect(finaliseRules(buildDynamicRules(inputs([item({ state: 'released' }), item({ state: 'declined' })])), () => false)).toEqual([]);
  });

  it('bypass outranks the gate but never the cart block; cart pass outranks the cart block', () => {
    expect(PRIORITY.bypass).toBeGreaterThan(PRIORITY.gate);
    expect(PRIORITY.bypass).toBeLessThan(PRIORITY.cart);
    expect(PRIORITY.cartPass).toBeGreaterThan(PRIORITY.cart);
    const session = finaliseRules(buildSessionRules(
      inputs([item(), item({ id: 'locked-down', productId: 'B000000009', lockdown: true })]),
      [
        { tabId: 7, itemId: 'item-1', expiresAt: NOW + 1000 },
        { tabId: 7, itemId: 'item-1', expiresAt: NOW - 1 }, // expired
        { tabId: 8, itemId: 'locked-down', expiresAt: NOW + 1000 }, // lockdown: no soft bypass
      ],
      [{ tabId: 9, domain: 'amazon.in', expiresAt: NOW + 1000 }],
      NOW,
    ), () => false, true);
    expect(session.map((r) => [r.priority, r.condition.tabIds])).toEqual([
      [PRIORITY.bypass, [7]],
      [PRIORITY.cartPass, [9]],
    ]);
  });
});

describe('urlFilter fallback — when RE2 refuses the regex', () => {
  // A real brand-store URL: long domain, 64-character slug. Chrome's RE2 rejects the regex
  // form with memoryLimitExceeded, which used to mean no lock at all on sites like this.
  const LONG = 'https://computechstore.in/product/nvidia-dgx-spark-gb10-ai-supercomputer-platform-for-deep-learning';
  const longItem = item({ id: 'long', url: LONG, domain: 'computechstore.in', productId: undefined, packId: undefined });
  const inputs = { items: [longItem], packFor: () => undefined, base: 'chrome-extension://abc/', extensionId: 'abc' };

  it('every rule carries a urlFilter alternative', () => {
    for (const built of buildDynamicRules(inputs)) {
      expect(built.fallback.length, JSON.stringify(built.rule.condition)).toBeGreaterThan(0);
      for (const f of built.fallback) {
        expect(f.condition.urlFilter).toBeTruthy();
        expect(f.condition.regexFilter).toBeUndefined();
      }
    }
  });

  it('swaps in urlFilter rules when the regex is rejected, and still locks', () => {
    const built = buildDynamicRules(inputs);
    const rules = finaliseRules(built, () => true); // pretend RE2 refused everything
    const gate = rules.find((r) => r.priority === PRIORITY.gate)!;
    expect(gate.condition.urlFilter).toBe('||computechstore.in/product/nvidia-dgx-spark-gb10-ai-supercomputer-platform-for-deep-learning');
    expect(gate.action.redirect?.url).toBe('chrome-extension://abc/pages/gate/index.html?id=long');
    // The cart block becomes one cheap rule per path, each naming its path for the interstitial.
    const carts = rules.filter((r) => r.priority === PRIORITY.cart);
    expect(carts.length).toBeGreaterThan(1);
    expect(carts.map((c) => c.condition.urlFilter)).toContain('||computechstore.in/cart');
    expect(carts[0]!.action.redirect?.url).toContain('&p=');
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('gateMatches works for both shapes, so the backstop and gate agree', () => {
    expect(gateMatches(longItem, undefined, `${LONG}/`)).toBe(true);
    expect(gateMatches(longItem, undefined, `${LONG}/?utm_source=x`)).toBe(true);
    expect(gateMatches(longItem, undefined, 'https://www.computechstore.in/product/nvidia-dgx-spark-gb10-ai-supercomputer-platform-for-deep-learning')).toBe(true);
    expect(gateMatches(longItem, undefined, 'https://computechstore.in/product/something-else')).toBe(false);
    expect(gateMatches(item(), amazon, 'https://www.amazon.in/-/hi/Sony/dp/B09XS7JWHH?th=1')).toBe(true);
  });

  it('urlFilter forms are sane', () => {
    expect(gateUrlFilter(item(), amazon)).toBe('||amazon.in/*B09XS7JWHH');
    expect(cartUrlFilters('computechstore.in').map((c) => c.filter)).toContain('||computechstore.in/checkout');
  });
});
