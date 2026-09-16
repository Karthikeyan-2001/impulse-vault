/**
 * Finding the buy path on a page: the site pack's selectors first, then generic patterns.
 * Used to place the Vault button, to hide buttons while locked, and by the click interceptor.
 *
 * Generic detection works from *labels*, not tags: modern storefronts (Flipkart's React Native
 * Web UI, Myntra) render "Add to cart" as a clickable <div>, so "is it a <button>?" misses them.
 */
import type { SitePack } from '../types';
import { queryAll } from './extractor/pack';

/** Whole-label matches, after trimming and collapsing whitespace. */
const ADD_LABEL = /^(add to (cart|bag|basket|trolley)|buy now|buy it now)$/i;
const CHECKOUT_LABEL = /^(proceed to (buy|checkout|pay)|place (your )?order|checkout|check out|pay now|continue to (checkout|payment))$/i;
const MAX_LABEL = 32;

export const GENERIC_CART_SELECTORS = [
  '[id*="add-to-cart" i]',
  '[id*="addtocart" i]',
  '[name="submit.add-to-cart"]',
  '[name="submit.buy-now"]',
  '[data-testid*="add-to-cart" i]',
  '[data-action*="add-to-cart" i]',
];

const CLICKABLE = 'button, a, input[type="submit"], input[type="button"], input[type="image"], [role="button"]';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function label(el: Element): string {
  const input = el as HTMLInputElement;
  if (el.tagName === 'INPUT') return norm(input.value);
  return norm(el.getAttribute('aria-label')) || norm(el.textContent);
}

function isShown(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect?.();
  return !!r && r.width > 0 && r.height > 0;
}

/** From a text node's element, climb to the outermost element whose label is exactly that text. */
function outermostWithSameLabel(el: Element): Element {
  const text = norm(el.textContent);
  let cur = el;
  for (let i = 0; i < 6; i++) {
    const p = cur.parentElement;
    if (!p || p === document.body || norm(p.textContent) !== text) break;
    cur = p;
  }
  return cur;
}

/** Elements labelled exactly like a buy control, found via text nodes (fast on huge pages). */
function labelledControls(re: RegExp): Element[] {
  const out = new Set<Element>();
  if (!document.body) return [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = norm(n.nodeValue);
    if (!t || t.length > MAX_LABEL || !re.test(t)) continue;
    const el = n.parentElement;
    if (!el || el.closest('impulse-vault, script, style, noscript')) continue;
    const top = outermostWithSameLabel(el);
    if (re.test(norm(top.textContent)) && isShown(top)) out.add(top);
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="submit"], input[type="button"]')) {
    if (re.test(norm(input.value)) && isShown(input)) out.add(input);
  }
  return [...out];
}

/** Add-to-cart / buy-now controls on this page (pack selectors, then generic ids, then labels). */
export function findAddButtons(pack?: SitePack): Element[] {
  const fromPack = [...queryAll(document, pack?.selectors.addToCart), ...queryAll(document, pack?.selectors.buyNow)];
  if (fromPack.length) return fromPack;
  const generic = queryAll(document, GENERIC_CART_SELECTORS).filter((el) => el.matches(CLICKABLE) && isShown(el));
  if (generic.length) return generic;
  return labelledControls(ADD_LABEL);
}

/** Where the Vault button goes: after this element. */
export function findAnchor(pack?: SitePack): Element | null {
  const anchor = queryAll(document, pack?.selectors.vaultAnchor).find(isShown);
  if (anchor) return anchor;
  return findAddButtons(pack).find(isShown) ?? null;
}

/**
 * Walk up from an event target: is this a buy/cart control? Checks the pack's selectors,
 * generic id/name patterns, then short exact labels on any ancestor — so a click on the icon
 * inside a <div>-button still counts, but a click anywhere inside a big "buy box" does not.
 */
export function matchBuyControl(target: EventTarget | null, pack: SitePack | undefined, opts: { checkoutOnly?: boolean } = {}): Element | null {
  if (!(target instanceof Element)) return null;
  const packSelectors = [
    ...(opts.checkoutOnly ? [] : [...(pack?.selectors.addToCart ?? []), ...(pack?.selectors.buyNow ?? [])]),
    ...(pack?.selectors.checkout ?? []),
  ];
  for (const sel of packSelectors) {
    try {
      const hit = target.closest(sel);
      if (hit) return hit;
    } catch {
      /* invalid user selector */
    }
  }
  // Label *starts with* the action ("Add to cart • ₹1,299"). Fused container text like
  // "ADD TO BAGWISHLIST" still fails: there's no word boundary between the fused words.
  const starts = (r: RegExp) => r.source.replace(/\$$/, '\\b');
  const re = new RegExp(opts.checkoutOnly ? starts(CHECKOUT_LABEL) : `${starts(ADD_LABEL)}|${starts(CHECKOUT_LABEL)}`, 'i');
  let el: Element | null = target;
  for (let i = 0; el && i < 6 && el !== document.body; i++, el = el.parentElement) {
    if (!opts.checkoutOnly && el.matches(CLICKABLE)) {
      for (const sel of GENERIC_CART_SELECTORS) {
        try {
          if (el.matches(sel)) return el;
        } catch {
          /* ignore */
        }
      }
    }
    const text = label(el);
    if (text.length > MAX_LABEL) return null; // we've climbed out of the control
    if (text && re.test(text)) return el;
  }
  return null;
}

/**
 * The element to hide for a matched button: climb through wrappers that are just a frame
 * around it — about the same size (Amazon's .a-button > .a-button-inner > input + label) — so
 * no empty button shell is left behind.
 */
export function hideTarget(el: Element): Element {
  let cur = el;
  const base = el.getBoundingClientRect();
  if (base.width === 0 || base.height === 0) return el;
  for (let i = 0; i < 4; i++) {
    const parent = cur.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    const r = parent.getBoundingClientRect();
    if (r.width > base.width * 1.25 + 8 || r.height > base.height * 1.4 + 8) break;
    cur = parent;
  }
  return cur;
}
