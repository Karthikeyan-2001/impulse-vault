/**
 * Strategy 5: heuristics. Confidence: low — the card pre-focuses the price for correction.
 * Title: most prominent <h1>. Image: largest image above the fold. Price: the most prominent
 * currency-formatted string. In a DOMParser document (no layout) prominence falls back to order.
 */
import { parsePrice, type Money } from '../../lib/money';
import { absoluteUrl, cleanText, imageFromElement, type Candidate } from './common';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'S', 'DEL', 'STRIKE', 'OPTION']);
const CURRENCY_HINT_RE = /[₹$€£¥₩₽₺฿₫₱]|\b(?:Rs\.?|INR|USD|EUR|GBP|kr|zł)\b/;

function fontSize(el: Element, live: boolean): number {
  if (!live) return 16;
  return parseFloat(getComputedStyle(el).fontSize) || 16;
}

function isStruck(el: Element, live: boolean): boolean {
  for (let e: Element | null = el, i = 0; e && i < 4; e = e.parentElement, i++) {
    if (SKIP_TAGS.has(e.tagName)) return true;
    if (live && getComputedStyle(e).textDecorationLine.includes('line-through')) return true;
    if (/\b(mrp|strike|was-price|list-price|old-price|original)/i.test(`${e.className} ${e.id}`)) return true;
  }
  return false;
}

function bestTitle(doc: Document, live: boolean): string | undefined {
  const h1s = [...doc.querySelectorAll('h1')].map((h) => ({ text: cleanText(h.textContent), size: fontSize(h, live) }));
  const best = h1s.filter((h) => h.text.length > 2 && h.text.length < 300).sort((a, b) => b.size - a.size)[0];
  if (best) return best.text;
  // "Product Name | Shop" → "Product Name"
  const t = cleanText(doc.title).split(/\s[|–—-]\s/)[0];
  return t || undefined;
}

function bestImage(doc: Document, url: string, live: boolean): string | undefined {
  const og = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  let best: { src: string; area: number } | undefined;
  const fold = live ? window.innerHeight * 1.2 : Infinity;
  for (const img of [...doc.images].slice(0, 200)) {
    let area: number;
    if (live) {
      const r = img.getBoundingClientRect();
      if (r.top > fold || r.bottom < 0) continue;
      area = r.width * r.height;
    } else {
      area = (Number(img.getAttribute('width')) || 0) * (Number(img.getAttribute('height')) || 0);
    }
    if (area < (live ? 150 * 150 : 1)) continue;
    const src = imageFromElement(img, url);
    if (src && (!best || area > best.area)) best = { src, area };
  }
  return best?.src ?? absoluteUrl(og, url);
}

function bestPrice(doc: Document, live: boolean, currencyHint?: string): Money | undefined {
  const body = doc.body;
  if (!body) return undefined;
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const fold = live ? window.innerHeight * 1.5 : Infinity;
  let best: { price: Money; score: number } | undefined;
  let seen = 0;
  for (let node = walker.nextNode(); node && seen < 400; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    if (!/\d/.test(text) || text.length > 200) continue;
    const el = node.parentElement;
    if (!el) continue;
    // Symbol may live in a sibling span: look at the parent's text too.
    const context = CURRENCY_HINT_RE.test(text) ? text : cleanText(el.parentElement?.textContent ?? '').slice(0, 120);
    if (!CURRENCY_HINT_RE.test(context)) continue;
    seen++;
    if (isStruck(el, live)) continue;
    const price = parsePrice(context, { currencyHint });
    if (!price) continue;
    let score = fontSize(el, live);
    if (live) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.top < fold) score *= 2;
    } else {
      score -= seen * 0.01; // earlier in the document wins ties
    }
    if (/price/i.test(`${el.className} ${el.id} ${el.parentElement?.className ?? ''}`)) score *= 1.5;
    if (!best || score > best.score) best = { price, score };
  }
  return best?.price;
}

export function fromHeuristics(doc: Document, url: string, live: boolean, currencyHint?: string): Candidate {
  return {
    title: bestTitle(doc, live),
    imageUrl: bestImage(doc, url, live),
    price: bestPrice(doc, live, currencyHint),
  };
}
