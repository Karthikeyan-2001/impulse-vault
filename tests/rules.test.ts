import { describe, expect, it } from 'vitest';
import amazonPack from '../sites/amazon.in.json';
import { PRIORITY, buildDynamicRules, buildSessionRules, cartRegex, gateRegex, matches } from '../src/lib/rules';
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
    const rules = buildDynamicRules(
      inputs([
        item(),
        item({ id: 'item-2', productId: 'B000000002' }),
        item({ id: 'ripe', state: 'ripe' }),
        item({ id: 'nolock', lockEnabled: false, productId: 'B000000003' }),
      ]),
    );
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
    expect(buildDynamicRules(inputs([item({ state: 'released' }), item({ state: 'declined' })]))).toEqual([]);
  });

  it('bypass outranks the gate but never the cart block; cart pass outranks the cart block', () => {
    expect(PRIORITY.bypass).toBeGreaterThan(PRIORITY.gate);
    expect(PRIORITY.bypass).toBeLessThan(PRIORITY.cart);
    expect(PRIORITY.cartPass).toBeGreaterThan(PRIORITY.cart);
    const session = buildSessionRules(
      inputs([item(), item({ id: 'locked-down', productId: 'B000000009', lockdown: true })]),
      [
        { tabId: 7, itemId: 'item-1', expiresAt: NOW + 1000 },
        { tabId: 7, itemId: 'item-1', expiresAt: NOW - 1 }, // expired
        { tabId: 8, itemId: 'locked-down', expiresAt: NOW + 1000 }, // lockdown: no soft bypass
      ],
      [{ tabId: 9, domain: 'amazon.in', expiresAt: NOW + 1000 }],
      NOW,
    );
    expect(session.map((r) => [r.priority, r.condition.tabIds])).toEqual([
      [PRIORITY.bypass, [7]],
      [PRIORITY.cartPass, [9]],
    ]);
  });
});
