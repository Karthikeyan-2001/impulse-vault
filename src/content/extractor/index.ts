/**
 * Layered extraction, first hit wins. A "hit" is a strategy that produced both a title and a
 * price; later strategies only fill gaps (image, stock). Order:
 *
 *   JSON-LD (high) → microdata (high) → site pack (high) → OpenGraph/meta (medium) → heuristics (low)
 *
 * The pack runs before meta tags because it's the higher-confidence source; see DECISIONS.md.
 * Runs against a live document (content script) or a DOMParser document (offscreen re-scrape).
 */
import { detectPlatform, isPlatformPack } from '../../lib/sitepack';
import { canonicalizeUrl, domainOf, extractProductId, parseUrl } from '../../lib/url';
import type { Confidence, Extraction, SitePack } from '../../types';
import { currencyFromHost, type Candidate } from './common';
import { fromHeuristics } from './heuristic';
import { fromJsonLd } from './jsonld';
import { fromMeta } from './meta';
import { fromMicrodata } from './microdata';
import { fromPack } from './pack';

export interface ExtractOptions {
  pack?: SitePack;
  /** Platform packs (Shopify, WooCommerce…), used when no domain pack matches. */
  platformPacks?: SitePack[];
  /** True in a rendered page (layout available); false in a DOMParser document. */
  live: boolean;
}

/**
 * A few indexed selector lookups that answer "could this be a product page at all?".
 * Cheap enough to run on every page when the extension is allowed on every site, so the
 * real extraction (and its heuristics) only runs where it might pay off.
 */
const PRODUCT_HINTS = [
  'script[type="application/ld+json"]',
  'meta[property="og:type"][content="product" i]',
  'meta[property="product:price:amount"]',
  'meta[property="og:price:amount"]',
  '[itemtype*="schema.org/Product" i]',
  'form[action*="/cart/add"]',
  'form.cart',
  '[id*="add-to-cart" i]',
  '[name="submit.add-to-cart"]',
  '[data-testid*="add-to-cart" i]',
  '[data-role="add-to-cart"]',
  '.shopify-payment-button__button',
  '.single_add_to_cart_button',
];

export function looksLikeProductPage(doc: ParentNode): boolean {
  return PRODUCT_HINTS.some((sel) => {
    try {
      return !!doc.querySelector(sel);
    } catch {
      return false;
    }
  });
}

export interface ExtractResult extends Extraction {
  /** The pack matched a product URL but none of its selectors hit: it may be outdated. */
  packMissed?: boolean;
}

const GENERIC_CART = /add to (cart|bag|basket)|buy now|add to trolley/i;

function hasGenericCartButton(doc: Document): boolean {
  if (doc.querySelector('[id*="add-to-cart" i], [name="submit.add-to-cart"], [data-testid*="add-to-cart" i]')) return true;
  for (const b of doc.querySelectorAll('button, input[type="submit"], [role="button"]')) {
    const text = (b as HTMLInputElement).value || b.textContent || '';
    if (text.length < 40 && GENERIC_CART.test(text)) return true;
  }
  return false;
}

export function extractProduct(doc: Document, url: string, opts: ExtractOptions): ExtractResult {
  const { live } = opts;
  // A domain pack wins; otherwise fingerprint the storefront software.
  const pack = opts.pack ?? detectPlatform(doc, opts.platformPacks ?? []);
  const u = parseUrl(url);
  const host = u?.hostname ?? '';
  const hint = pack?.currency ?? currencyFromHost(host);
  const productId = extractProductId(url, pack);

  type Step = [Extraction['source'], Confidence, () => Candidate | null];
  let packMatched = true;
  const steps: Step[] = [
    ['json-ld', 'high', () => fromJsonLd(doc, hint)],
    ['microdata', 'high', () => fromMicrodata(doc, url, hint)],
  ];
  if (pack) {
    steps.push(['pack', 'high', () => {
      const c = fromPack(doc, url, pack, live);
      packMatched = c.matchedAnything;
      return c;
    }]);
  }
  steps.push(['meta', 'medium', () => fromMeta(doc, url, hint)]);
  steps.push(['heuristic', 'low', () => fromHeuristics(doc, url, live, hint)]);

  const merged: Candidate = {};
  let source: Extraction['source'] = 'none';
  let confidence: Confidence = 'low';
  let priceSource: [Extraction['source'], Confidence] | undefined;
  let isProduct = !!productId;

  for (const [name, conf, run] of steps) {
    // Heuristics are the expensive one; skip once everything is filled.
    if (name === 'heuristic' && source !== 'none' && merged.imageUrl) break;
    const c = run();
    if (!c) continue;
    if (c.isProduct) isProduct = true;
    if (source === 'none' && c.title && c.price) {
      source = name;
      confidence = conf;
      merged.title = c.title;
      merged.price = c.price;
    }
    if (!priceSource && c.price) priceSource = [name, conf];
    merged.title ??= c.title;
    merged.price ??= c.price;
    merged.imageUrl ??= c.imageUrl;
    merged.inStock ??= c.inStock;
  }
  if (source === 'none' && priceSource) {
    // Price without a matching title: trust is only as good as where the price came from, capped at medium.
    source = priceSource[0];
    confidence = priceSource[1] === 'high' ? 'medium' : priceSource[1];
  }
  if (!isProduct && merged.price && hasGenericCartButton(doc)) isProduct = true;
  if (!merged.price) confidence = 'low';

  return {
    url,
    canonicalUrl: canonicalizeUrl(url, pack),
    domain: domainOf(url),
    title: merged.title,
    imageUrl: merged.imageUrl,
    price: merged.price,
    confidence,
    source,
    inStock: merged.inStock,
    productId,
    packId: pack?.id,
    isProductPage: isProduct,
    packMissed: !!(pack && !isPlatformPack(pack) && productId && !packMatched),
  };
}
