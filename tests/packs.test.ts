import { describe, expect, it } from 'vitest';
import { BUILTIN_PACKS } from '../src/lib/builtin-packs';
import { cartRegex, gateRegex, matches } from '../src/lib/rules';
import { validatePack } from '../src/lib/sitepack';
import { canonicalizeUrl, extractProductId, findPack } from '../src/lib/url';

/** Real product URLs, captured from the live sites. */
const SAMPLES: { id: string; url: string; productId: string; canonical: string; cart: string[] }[] = [
  {
    id: 'amazon.in',
    url: 'https://www.amazon.in/Sony-WH-1000XM5/dp/B09XS7JWHH/ref=sr_1_3?crid=2&keywords=sony&tag=aff-21',
    productId: 'B09XS7JWHH',
    canonical: 'https://www.amazon.in/dp/B09XS7JWHH',
    cart: ['https://www.amazon.in/gp/cart/view.html', 'https://www.amazon.in/gp/buy/spc/handlers/display.html'],
  },
  {
    id: 'amazon.com',
    url: 'https://www.amazon.com/dp/B09XS7JWHH?th=1',
    productId: 'B09XS7JWHH',
    canonical: 'https://www.amazon.com/dp/B09XS7JWHH',
    cart: ['https://www.amazon.com/gp/cart/view.html'],
  },
  {
    id: 'flipkart.com',
    url: 'https://www.flipkart.com/frony-eq-1033-p47-headset-super-extra-bass-bluetooth-furious-ear/p/itm03e19749559a4?pid=ACCGZZHWHMMQPFNT&lid=LSTACCGZZHWHMMQPFNT0HPFOO&marketplace=FLIPKART&q=wireless+headphones&store=0pm&srno=s_1_1&otracker=search&iid=en_ZZE9&ssid=xe5h4v81cw&qH=7dcb2164',
    productId: 'itm03e19749559a4',
    canonical: 'https://www.flipkart.com/frony-eq-1033-p47-headset-super-extra-bass-bluetooth-furious-ear/p/itm03e19749559a4?pid=ACCGZZHWHMMQPFNT',
    cart: ['https://www.flipkart.com/viewcart?exploreMode=true', 'https://www.flipkart.com/checkout/init'],
  },
  {
    id: 'myntra.com',
    url: 'https://www.myntra.com/headphones/noise/noise-master-buds-truly-wireless-bluetooth-earbuds/42047087/buy',
    productId: '42047087',
    canonical: 'https://www.myntra.com/42047087',
    cart: ['https://www.myntra.com/checkout/cart', 'https://www.myntra.com/checkout/address'],
  },
  {
    id: 'ajio.com',
    url: 'https://www.ajio.com/teamspirit-men-printed-regular-fit-crew-neck-t-shirt/p/443121300_beige?query=tshirt',
    productId: '443121300_beige',
    canonical: 'https://www.ajio.com/teamspirit-men-printed-regular-fit-crew-neck-t-shirt/p/443121300_beige',
    cart: ['https://www.ajio.com/cart', 'https://www.ajio.com/checkout/payment'],
  },
  {
    id: 'nykaa.com',
    url: 'https://www.nykaa.com/m-a-c-matte-mini-lipstick/p/15100008?productId=15100008&pps=1&skuId=15100000',
    productId: '15100008',
    canonical: 'https://www.nykaa.com/m-a-c-matte-mini-lipstick/p/15100008?skuId=15100000',
    cart: ['https://www.nykaa.com/checkout-v2/cart', 'https://www.nykaa.com/cart'],
  },
  {
    id: 'croma.com',
    url: 'https://www.croma.com/sony-mdr-ex255apbqin-wired-earphone-with-mic-in-ear-black-/p/204095',
    productId: '204095',
    canonical: 'https://www.croma.com/p/204095',
    cart: ['https://www.croma.com/cart', 'https://www.croma.com/checkout/cart'],
  },
];

describe('shipped site packs', () => {
  it('ships one pack per supported retailer, all valid, ids unique', () => {
    const ids = BUILTIN_PACKS.map((p) => p.id).sort();
    expect(ids).toEqual(['ajio.com', 'amazon.com', 'amazon.in', 'croma.com', 'flipkart.com', 'myntra.com', 'nykaa.com']);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pack of BUILTIN_PACKS) {
      const result = validatePack(pack);
      expect(result.ok ? [] : result.errors, pack.id).toEqual([]);
    }
  });

  it.each(SAMPLES)('$id: id, canonical URL and gate', (sample) => {
    const pack = findPack(sample.url, BUILTIN_PACKS);
    expect(pack?.id).toBe(sample.id);
    expect(extractProductId(sample.url, pack)).toBe(sample.productId);
    expect(canonicalizeUrl(sample.url, pack)).toBe(sample.canonical);
    // The same product, however it was reached, hits the gate.
    const item = { url: sample.canonical, domain: sample.id, productId: sample.productId };
    const gate = gateRegex(item, pack);
    expect(matches(gate, sample.url), 'original URL').toBe(true);
    expect(matches(gate, sample.canonical), 'canonical URL').toBe(true);
    // ...and unrelated pages don't.
    expect(matches(gate, `https://www.${sample.id}/`)).toBe(false);
    for (const cart of sample.cart) expect(matches(gate, cart), `gate must ignore ${cart}`).toBe(false);
  });

  it.each(SAMPLES)('$id: cart paths block checkout but never the product page', (sample) => {
    const pack = findPack(sample.url, BUILTIN_PACKS);
    const cart = cartRegex(sample.id, pack);
    for (const url of sample.cart) expect(matches(cart, url), `must block ${url}`).toBe(true);
    // A cart rule that swallowed product pages would block browsing entirely.
    expect(matches(cart, sample.url), 'product URL').toBe(false);
    expect(matches(cart, sample.canonical), 'canonical URL').toBe(false);
    expect(matches(cart, `https://www.${sample.id}/`), 'home page').toBe(false);
  });
});
