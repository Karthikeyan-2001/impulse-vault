/**
 * Re-scraping prices. We can't scrape a page we've redirected away from, and DOMParser isn't
 * available in the service worker, so: fetch + parse in an offscreen document. Its requests
 * are `xmlhttprequest`, never `main_frame`, so our own DNR gate rules can't catch them.
 */
import type { Extraction, SitePack } from '../types';
import type { OffscreenScrape } from '../types/messages';

const PATH = 'offscreen/index.html';
let creating: Promise<void> | null = null;

async function hasDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(PATH)],
  });
  return contexts.length > 0;
}

async function ensureDocument(): Promise<void> {
  if (await hasDocument()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: PATH,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Re-read a product page to check its price when a cooling-off timer ends.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

/** Best effort: null on any failure (offline, captcha page, site changed). Never throws. */
export async function scrapeUrl(url: string, pack?: SitePack): Promise<Extraction | null> {
  try {
    await ensureDocument();
    const msg: OffscreenScrape = { target: 'offscreen', type: 'scrape', url, pack };
    return ((await chrome.runtime.sendMessage(msg)) as Extraction | null) ?? null;
  } catch {
    return null;
  }
}

export async function closeOffscreen(): Promise<void> {
  try {
    if (await hasDocument()) await chrome.offscreen.closeDocument();
  } catch {
    /* already closed */
  }
}
