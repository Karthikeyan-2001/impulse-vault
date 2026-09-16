/** Boot + layout shared by the gate and interstitial pages (extension pages, no framework). */
import { injectStyles, h } from '../ui/dom';
import { THEME_CSS } from '../ui/theme';
import { UNLOCK_CSS } from '../ui/unlock';

const PAGE_CSS = /* css */ `
html, body { margin: 0; min-height: 100%; background: var(--iv-bg); }
body { display: grid; place-items: center; min-height: 100vh; padding: 24px; box-sizing: border-box; }
.iv-page { width: 100%; max-width: 540px; }
.iv-page-card { background: var(--iv-surface); border: 1px solid var(--iv-line); border-radius: 24px; padding: 30px 30px 26px; box-shadow: var(--iv-shadow); }
.iv-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--iv-muted); }
.iv-brand img { width: 22px; height: 22px; }
.iv-h1 { margin: 0 0 6px; font-size: 24px; line-height: 1.25; letter-spacing: -.015em; font-weight: 750; text-wrap: balance; }
.iv-sub { margin: 0 0 20px; color: var(--iv-muted); font-size: 15px; line-height: 1.45; }
.iv-foot { margin: 16px 4px 0; font-size: 12px; color: var(--iv-muted); text-align: center; }
.iv-stack { display: grid; gap: 12px; }
.iv-mini { display: flex; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--iv-line); border-radius: 14px; }
.iv-mini img { width: 48px; height: 48px; border-radius: 10px; border: 1px solid var(--iv-line); object-fit: contain; background: var(--iv-surface-2); flex: none; }
.iv-mini-title { font-weight: 650; font-size: 14px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.iv-mini-meta { font-size: 12.5px; color: var(--iv-muted); }
.iv-pass { display: grid; gap: 10px; padding: 14px; border: 1px dashed var(--iv-line); border-radius: 14px; margin-top: 4px; }
.iv-pass p { margin: 0; font-size: 13px; color: var(--iv-muted); }
.iv-pass label { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; cursor: pointer; }
.iv-pass input { margin-top: 3px; accent-color: var(--iv-brass); }
.iv-payout { text-align: center; padding: 16px 0 4px; display: grid; gap: 6px; }
.iv-payout strong { font-size: 26px; color: var(--iv-mint); letter-spacing: -.01em; }
.iv-hr { border: 0; border-top: 1px solid var(--iv-line); margin: 18px 0; }
`;

export function bootPage(): HTMLElement {
  injectStyles(document, 'theme', THEME_CSS);
  injectStyles(document, 'unlock', UNLOCK_CSS);
  injectStyles(document, 'page', PAGE_CSS);
  document.documentElement.classList.add('iv-root');
  const root = document.getElementById('root')!;
  return root;
}

export function brand(label = 'Impulse Vault'): HTMLElement {
  return h('div', { class: 'iv-brand' }, h('img', { src: chrome.runtime.getURL('icons/icon-48.png'), alt: '' }), label);
}

/** The original URL we were redirected from: everything after the first '#', verbatim. */
export function originalUrl(): string {
  const i = location.href.indexOf('#');
  return i >= 0 ? location.href.slice(i + 1) : '';
}

/**
 * Where "take me back" goes: the page before (if it isn't the one we're gating), else the
 * store's home. `fallbackUrl` covers redirects that couldn't carry the original URL — a
 * urlFilter rule has no way to pass it through.
 */
export function backDestination(original: string, isGated: (url: string) => boolean, fallbackUrl = ''): string {
  const ref = document.referrer;
  if (ref && /^https?:/.test(ref) && !isGated(ref)) return ref;
  for (const candidate of [original, fallbackUrl]) {
    try {
      return `${new URL(candidate).origin}/`;
    } catch {
      /* not a URL: try the next candidate */
    }
  }
  return 'chrome://newtab/';
}

export async function currentTabId(): Promise<number> {
  const tab = await chrome.tabs.getCurrent();
  return tab?.id ?? -1;
}

/** Navigate this tab explicitly — never via history, so Back can't bounce into a redirect loop. */
export async function goTo(url: string): Promise<void> {
  const id = await currentTabId();
  if (id >= 0) await chrome.tabs.update(id, { url });
  else location.href = url;
}
