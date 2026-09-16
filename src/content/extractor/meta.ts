/** Strategy 3: OpenGraph / product meta / Twitter cards. Confidence: medium. */
import { parseAmount, parsePrice } from '../../lib/money';
import { absoluteUrl, cleanText, decodeEntities, type Candidate } from './common';

function meta(doc: Document, ...names: string[]): string | undefined {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
    const v = el?.getAttribute('content');
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function fromMeta(doc: Document, url: string, currencyHint?: string): Candidate | null {
  const title = meta(doc, 'og:title', 'twitter:title');
  const image = meta(doc, 'og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src');
  const currency = meta(doc, 'product:price:currency', 'og:price:currency', 'product:sale_price:currency', 'priceCurrency')?.toUpperCase() ?? currencyHint;
  const amount = meta(doc, 'product:sale_price:amount', 'product:price:amount', 'og:price:amount', 'price');
  let price = amount && currency ? parseAmount(amount, currency) : null;
  if (!price) {
    // Twitter product cards: twitter:label1 = "Price", twitter:data1 = "₹1,299"
    for (const i of [1, 2]) {
      const label = meta(doc, `twitter:label${i}`);
      const data = meta(doc, `twitter:data${i}`);
      if (data && (!label || /price/i.test(label))) {
        price = parsePrice(data, { currencyHint: currency });
        if (price) break;
      }
    }
  }
  const ogType = meta(doc, 'og:type');
  const availability = meta(doc, 'product:availability', 'og:availability');
  if (!title && !price && !image) return null;
  return {
    title: title ? cleanText(decodeEntities(title)) : undefined,
    imageUrl: absoluteUrl(image, url),
    price: price ?? undefined,
    inStock: availability ? !/out of stock|oos|sold/i.test(availability) : undefined,
    isProduct: /product/i.test(ogType ?? '') || !!amount,
  };
}
