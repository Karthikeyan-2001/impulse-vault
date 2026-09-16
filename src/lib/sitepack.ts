import type { SitePack } from '../types';
import { isCurrencyCode } from './money';

const SELECTOR_KEYS = ['title', 'price', 'image', 'addToCart', 'buyNow', 'checkout', 'outOfStock', 'vaultAnchor'] as const;

/** Paths used by the cart/checkout block when a site has no pack (or its pack lists none). */
export const DEFAULT_CART_PATHS = ['cart', 'checkout', 'buy', 'gp/buy', 'checkout/init', 'viewcart', 'basket', 'bag'];

export type PackValidation = { ok: true; pack: SitePack } | { ok: false; errors: string[] };

function compiles(re: string): boolean {
  try {
    new RegExp(re);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a pack (e.g. from the Options JSON editor). `isValidSelector` is injected so this
 * stays testable outside a DOM; in the browser pass `(s) => { document.querySelector(s); return true }`.
 */
export function validatePack(input: unknown, isValidSelector?: (s: string) => boolean): PackValidation {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['A pack must be a JSON object.'] };
  }
  const p = input as Record<string, any>;
  if (typeof p.id !== 'string' || !/^[a-z0-9.-]+$/.test(p.id)) errors.push('"id" must be lowercase letters, digits, dots or dashes.');
  if (typeof p.name !== 'string' || !p.name.trim()) errors.push('"name" is required.');
  if (!Array.isArray(p.domains) || p.domains.length === 0) {
    errors.push('"domains" needs at least one domain, like "example.com".');
  } else {
    for (const d of p.domains) {
      if (typeof d !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) errors.push(`"${d}" isn't a bare domain (no https://, no paths).`);
    }
  }
  if (p.currency !== undefined && !isCurrencyCode(p.currency)) errors.push('"currency" must be a 3-letter code like "INR".');
  for (const key of ['productIdPattern', 'gatePathPattern'] as const) {
    if (p[key] !== undefined) {
      if (typeof p[key] !== 'string' || !compiles(p[key].replace('{id}', 'X'))) errors.push(`"${key}" isn't a valid regular expression.`);
    }
  }
  if (typeof p.productIdPattern === 'string' && compiles(p.productIdPattern) && !/\((?!\?)/.test(p.productIdPattern)) {
    errors.push('"productIdPattern" needs a capture group ( … ) around the product id.');
  }
  if (p.gatePathPattern !== undefined && typeof p.gatePathPattern === 'string' && !p.gatePathPattern.includes('{id}')) {
    errors.push('"gatePathPattern" must contain {id}.');
  }
  if (p.canonicalUrl !== undefined && (typeof p.canonicalUrl !== 'string' || !/^https:\/\/.+\{id\}/.test(p.canonicalUrl))) {
    errors.push('"canonicalUrl" must be an https URL containing {id}.');
  }
  if (typeof p.selectors !== 'object' || p.selectors === null || Array.isArray(p.selectors)) {
    errors.push('"selectors" must be an object (it can be empty: {}).');
  } else {
    for (const [key, list] of Object.entries(p.selectors)) {
      if (!(SELECTOR_KEYS as readonly string[]).includes(key)) {
        errors.push(`Unknown selector group "${key}". Known: ${SELECTOR_KEYS.join(', ')}.`);
        continue;
      }
      if (!Array.isArray(list) || list.some((s) => typeof s !== 'string' || !s.trim())) {
        errors.push(`"selectors.${key}" must be a list of CSS selectors.`);
        continue;
      }
      if (isValidSelector) {
        for (const s of list as string[]) if (!isValidSelector(s)) errors.push(`"${s}" (selectors.${key}) isn't a valid CSS selector.`);
      }
    }
  }
  for (const key of ['cartPaths', 'outOfStockText', 'keepParams'] as const) {
    if (p[key] !== undefined && (!Array.isArray(p[key]) || p[key].some((s: unknown) => typeof s !== 'string'))) {
      errors.push(`"${key}" must be a list of strings.`);
    }
  }
  if (Array.isArray(p.cartPaths)) {
    for (const c of p.cartPaths) if (typeof c === 'string' && !compiles(c)) errors.push(`cart path "${c}" isn't a valid regular expression.`);
  }
  if (errors.length) return { ok: false, errors };
  const { $schema: _ignored, ...pack } = p;
  return { ok: true, pack: pack as SitePack };
}

/** Built-ins, with same-id overrides swapped in and custom packs appended. */
export function effectivePacks(builtins: SitePack[], overrides: Record<string, SitePack>): SitePack[] {
  const out = builtins.map((b) => overrides[b.id] ?? b);
  for (const [id, pack] of Object.entries(overrides)) if (!builtins.some((b) => b.id === id)) out.push(pack);
  return out;
}
