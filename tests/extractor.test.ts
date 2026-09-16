// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import amazonPack from '../sites/amazon.in.json';
import { extractProduct } from '../src/content/extractor';
import { parseJsonLdProduct } from '../src/content/extractor/jsonld';
import type { SitePack } from '../src/types';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('JSON-LD', () => {
  it('finds a Product inside @graph with an AggregateOffer', () => {
    const c = parseJsonLdProduct([
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Shop' },
          {
            '@type': 'Product',
            name: 'Linen shirt &amp; tie',
            image: [{ '@type': 'ImageObject', url: 'https://cdn.example/a.jpg' }],
            offers: { '@type': 'AggregateOffer', lowPrice: '1299.00', highPrice: '1499', priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
          },
        ],
      }),
    ]);
    expect(c).toMatchObject({ title: 'Linen shirt & tie', imageUrl: 'https://cdn.example/a.jpg', price: { amountMinor: 129900, currency: 'INR' }, inStock: true });
  });

  it('survives broken JSON and reports sold out', () => {
    const c = parseJsonLdProduct([
      '{ not json',
      '{"@type":["Product"],"name":"Lamp","offers":[{"price":"49.99","priceCurrency":"USD","availability":"http://schema.org/OutOfStock"}]}',
    ]);
    expect(c).toMatchObject({ title: 'Lamp', price: { amountMinor: 4999, currency: 'USD' }, inStock: false });
  });
});

describe('extractProduct', () => {
  it('Amazon-shaped page: pack wins with the split-span sale price, not the MRP', () => {
    const d = doc(`
      <h1><span id="productTitle">  Sony WH-1000XM5 Wireless Headphones  </span></h1>
      <div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price priceToPay"><span class="a-offscreen"></span>
          <span class="a-price-symbol">₹</span><span class="a-price-whole">26,990<span class="a-price-decimal">.</span></span><span class="a-price-fraction">00</span>
        </span>
        <span class="a-price a-text-price">M.R.P.: <span class="a-offscreen">₹34,990.00</span></span>
      </div>
      <div id="imgTagWrapperId"><img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/big.jpg" src="https://m.media-amazon.com/images/I/small.jpg"></div>
      <div id="availability"><span>In stock</span></div>
      <div id="addToCart_feature_div"><input id="add-to-cart-button" type="submit" value="Add to Cart"></div>`);
    const ex = extractProduct(d, 'https://www.amazon.in/Sony-WH-1000XM5/dp/B09XS7JWHH/ref=sr_1_1?tag=abc', {
      pack: amazonPack as SitePack,
      live: false,
    });
    expect(ex).toMatchObject({
      source: 'pack',
      confidence: 'high',
      title: 'Sony WH-1000XM5 Wireless Headphones',
      price: { amountMinor: 2699000, currency: 'INR' },
      imageUrl: 'https://m.media-amazon.com/images/I/big.jpg',
      productId: 'B09XS7JWHH',
      canonicalUrl: 'https://www.amazon.in/dp/B09XS7JWHH',
      isProductPage: true,
      inStock: true,
      packMissed: false,
    });
  });

  it('flags a pack that matched a product URL but no selectors (outdated pack)', () => {
    const ex = extractProduct(doc('<h1>Something</h1>'), 'https://www.amazon.in/dp/B09XS7JWHH', { pack: amazonPack as SitePack, live: false });
    expect(ex.packMissed).toBe(true);
  });

  it('OpenGraph only → medium', () => {
    const d = doc(`<head>
      <meta property="og:title" content="Ceramic Mug">
      <meta property="og:image" content="/mug.jpg">
      <meta property="product:price:amount" content="18.00">
      <meta property="product:price:currency" content="EUR">
    </head>`);
    expect(extractProduct(d, 'https://shop.example.de/mug', { live: false })).toMatchObject({
      source: 'meta',
      confidence: 'medium',
      price: { amountMinor: 1800, currency: 'EUR' },
      imageUrl: 'https://shop.example.de/mug.jpg',
    });
  });

  it('heuristics → low, ignoring struck-through prices', () => {
    const d = doc(`<title>Desk Lamp | Lamps R Us</title><body>
      <h1>Desk Lamp</h1><del>₹2,999</del><div class="price">₹1,999</div>
      <button>Add to cart</button></body>`);
    expect(extractProduct(d, 'https://lamps.example.in/desk-lamp', { live: false })).toMatchObject({
      source: 'heuristic',
      confidence: 'low',
      title: 'Desk Lamp',
      price: { amountMinor: 199900, currency: 'INR' },
      isProductPage: true,
    });
  });
});
