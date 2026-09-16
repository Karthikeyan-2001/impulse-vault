/** Offscreen document: fetch a product page and run the same extractor the content script uses. */
import { extractProduct } from '../content/extractor';
import type { Extraction } from '../types';
import type { OffscreenScrape } from '../types/messages';

async function scrape(url: string, msg: OffscreenScrape): Promise<Extraction | null> {
  const res = await fetch(url, {
    credentials: 'include',
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  return extractProduct(doc, res.url || url, { pack: msg.pack, live: false });
}

chrome.runtime.onMessage.addListener((msg: OffscreenScrape, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'scrape') return false;
  scrape(msg.url, msg).then(sendResponse, () => sendResponse(null));
  return true;
});
