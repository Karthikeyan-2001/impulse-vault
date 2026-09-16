/** Strategy 2: schema.org Product microdata. Confidence: high. */
import { parseAmount, parsePrice } from '../../lib/money';
import { cleanText, imageFromElement, type Candidate } from './common';

function propValue(el: Element): string {
  return (
    el.getAttribute('content') ??
    el.getAttribute('value') ??
    (el.tagName === 'LINK' || el.tagName === 'A' ? el.getAttribute('href') : null) ??
    cleanText(el.textContent)
  );
}

export function fromMicrodata(doc: Document, url: string, currencyHint?: string): Candidate | null {
  const scope = doc.querySelector('[itemscope][itemtype*="schema.org/Product" i]');
  if (!scope) return null;

  // `name` of the product itself, not of a nested brand/offer/review scope.
  const name = [...scope.querySelectorAll('[itemprop="name"]')].find(
    (el) => el.parentElement?.closest('[itemscope]') === scope,
  );
  const currencyEl = scope.querySelector('[itemprop="priceCurrency"]');
  const currency = (currencyEl ? propValue(currencyEl) : currencyHint)?.toUpperCase();
  const priceEl = scope.querySelector('[itemprop="lowPrice"], [itemprop="price"]');
  let price;
  if (priceEl) {
    const raw = propValue(priceEl);
    price = currency ? parseAmount(raw, currency) : parsePrice(raw, { currencyHint });
  }
  const imageEl = scope.querySelector('[itemprop="image"]');
  const availability = scope.querySelector('[itemprop="availability"]');
  const avail = availability ? propValue(availability) : '';

  return {
    title: name ? cleanText(propValue(name)) || undefined : undefined,
    imageUrl: imageEl ? imageFromElement(imageEl, url) : undefined,
    price: price ?? undefined,
    inStock: /OutOfStock|SoldOut|Discontinued/i.test(avail) ? false : /InStock/i.test(avail) ? true : undefined,
    isProduct: true,
  };
}
