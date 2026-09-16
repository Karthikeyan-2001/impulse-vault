import type { Money } from '../../lib/money';

export interface Candidate {
  title?: string;
  imageUrl?: string;
  price?: Money;
  inStock?: boolean;
  /** The strategy saw strong evidence this is a product page. */
  isProduct?: boolean;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…' };

/** Minimal entity decoding for strings lifted out of JSON-LD / attributes. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function absoluteUrl(src: string | null | undefined, base: string): string | undefined {
  if (!src) return undefined;
  const s = src.trim();
  if (!s || s.startsWith('data:')) return undefined;
  try {
    return new URL(s, base).toString();
  } catch {
    return undefined;
  }
}

/** Best URL for an <img> (or anything with an image-ish attribute), including lazy-load attributes. */
export function imageFromElement(el: Element, base: string): string | undefined {
  if (el instanceof HTMLMetaElement) return absoluteUrl(el.content, base);
  const dyn = el.getAttribute('data-a-dynamic-image'); // Amazon: {"url": [w,h], ...}
  if (dyn) {
    try {
      const urls = Object.keys(JSON.parse(dyn));
      if (urls[0]) return absoluteUrl(urls[0], base);
    } catch {
      /* fall through */
    }
  }
  for (const attr of ['data-old-hires', 'data-zoom-image', 'data-src', 'data-lazy-src', 'content', 'href']) {
    const v = el.getAttribute(attr);
    if (v && !v.startsWith('data:')) return absoluteUrl(v, base);
  }
  const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
  if (img) return absoluteUrl(img.currentSrc || img.getAttribute('src') || img.getAttribute('srcset')?.split(/\s+/)[0], base);
  return undefined;
}

const TLD_CURRENCY: Record<string, string> = {
  in: 'INR', uk: 'GBP', de: 'EUR', fr: 'EUR', it: 'EUR', es: 'EUR', nl: 'EUR', ie: 'EUR', at: 'EUR', be: 'EUR',
  fi: 'EUR', pt: 'EUR', jp: 'JPY', se: 'SEK', no: 'NOK', dk: 'DKK', ca: 'CAD', au: 'AUD', nz: 'NZD', sg: 'SGD',
  ae: 'AED', ch: 'CHF', pl: 'PLN', br: 'BRL', mx: 'MXN',
};

export function currencyFromHost(host: string): string | undefined {
  const tld = host.toLowerCase().split('.').pop() ?? '';
  return TLD_CURRENCY[tld];
}

/** Element is rendered. In a DOMParser document nothing is laid out, so everything counts as visible. */
export function isVisible(el: Element, live: boolean): boolean {
  if (!live) return true;
  const he = el as HTMLElement;
  if (he.offsetParent === null && getComputedStyle(he).position !== 'fixed') return false;
  const r = he.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
