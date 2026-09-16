import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, domainOf, extractProductId, findPack } from '../src/lib/url';
import type { SitePack } from '../src/types';

const amazon: SitePack = {
  id: 'amazon.in',
  name: 'Amazon India',
  domains: ['amazon.in'],
  productIdPattern: '/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})',
  canonicalUrl: 'https://www.amazon.in/dp/{id}',
  selectors: {},
};

describe('canonicalizeUrl', () => {
  it('strips tracking params, hash and trailing slash; sorts the rest', () => {
    expect(
      canonicalizeUrl('https://Shop.Example.com/item/42/?utm_source=x&b=2&ref=abc&a=1&gclid=z&fbclid=y&tag=t#reviews'),
    ).toBe('https://shop.example.com/item/42?a=1&b=2');
  });

  it('two links to the same product dedupe to one URL', () => {
    const a = canonicalizeUrl('https://shop.example.com/p/42?utm_campaign=sale');
    const b = canonicalizeUrl('https://shop.example.com/p/42/?fbclid=abc#top');
    expect(a).toBe(b);
  });

  it('uses the pack template when the product ID is known', () => {
    expect(
      canonicalizeUrl('https://www.amazon.in/Sony-WH-1000XM5/dp/B0CX23V2ZK/ref=sr_1_3?crid=2&keywords=sony&th=1', amazon),
    ).toBe('https://www.amazon.in/dp/B0CX23V2ZK');
    expect(canonicalizeUrl('https://m.amazon.in/gp/aw/d/B0CX23V2ZK?psc=1', amazon)).toBe(
      'https://www.amazon.in/dp/B0CX23V2ZK',
    );
  });
});

describe('domains and packs', () => {
  it('normalises www./m. prefixes', () => {
    expect(domainOf('https://www.amazon.in/dp/x')).toBe('amazon.in');
    expect(domainOf('https://m.myntra.com/x')).toBe('myntra.com');
    expect(domainOf('https://shop.example.co.uk/x')).toBe('shop.example.co.uk');
  });

  it('matches packs by domain suffix, not substring', () => {
    expect(findPack('https://smile.amazon.in/x', [amazon])?.id).toBe('amazon.in');
    expect(findPack('https://notamazon.in/x', [amazon])).toBeUndefined();
  });

  it('extracts product IDs', () => {
    expect(extractProductId('https://www.amazon.in/-/hi/Sony/dp/B0CX23V2ZK?th=1', amazon)).toBe('B0CX23V2ZK');
    expect(extractProductId('https://www.amazon.in/s?k=sony', amazon)).toBeUndefined();
  });
});
