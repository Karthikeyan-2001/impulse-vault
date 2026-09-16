/** Strategy 4: per-site selector pack. Confidence: high (someone wrote these for this site). */
import { parsePrice } from '../../lib/money';
import type { SitePack } from '../../types';
import { cleanText, imageFromElement, isVisible, type Candidate } from './common';

function firstMatch(doc: Document, selectors: string[] | undefined, live: boolean): Element | null {
  for (const sel of selectors ?? []) {
    try {
      for (const el of doc.querySelectorAll(sel)) {
        if (isVisible(el, live) || !live) return el;
      }
      // Hidden-but-present still beats nothing (Amazon's .a-offscreen is visually hidden on purpose).
      const any = doc.querySelector(sel);
      if (any) return any;
    } catch {
      /* invalid selector in a user-edited pack: skip it */
    }
  }
  return null;
}

export function queryAll(root: ParentNode, selectors: string[] | undefined): Element[] {
  const out: Element[] = [];
  for (const sel of selectors ?? []) {
    try {
      out.push(...root.querySelectorAll(sel));
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function packSoldOut(doc: Document, pack: SitePack): boolean | undefined {
  const els = queryAll(doc, pack.selectors.outOfStock);
  if (els.length === 0) return undefined;
  const phrases = pack.outOfStockText ?? [];
  if (phrases.length === 0) return true;
  return els.some((el) => {
    const t = cleanText(el.textContent).toLowerCase();
    return phrases.some((p) => t.includes(p));
  });
}

export function fromPack(doc: Document, url: string, pack: SitePack, live: boolean): Candidate & { matchedAnything: boolean } {
  const titleEl = firstMatch(doc, pack.selectors.title, live);
  let price;
  for (const sel of pack.selectors.price ?? []) {
    let els: Element[] = [];
    try {
      els = [...doc.querySelectorAll(sel)];
    } catch {
      continue;
    }
    for (const el of els) {
      price = parsePrice(el.textContent ?? '', { currencyHint: pack.currency });
      if (price) break;
    }
    if (price) break;
  }
  const imageEl = firstMatch(doc, pack.selectors.image, live);
  const cartEl = firstMatch(doc, pack.selectors.addToCart, live) ?? firstMatch(doc, pack.selectors.buyNow, live);
  const soldOut = packSoldOut(doc, pack);
  const title = titleEl ? cleanText(titleEl.textContent) || titleEl.getAttribute('content') || undefined : undefined;
  return {
    title,
    imageUrl: imageEl ? imageFromElement(imageEl, url) : undefined,
    price: price ?? undefined,
    inStock: soldOut === undefined ? undefined : !soldOut,
    isProduct: !!(title && (price || cartEl || soldOut)),
    matchedAnything: !!(titleEl || price || imageEl || cartEl),
  };
}
