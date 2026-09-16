/**
 * The vault window, opened from the context menu ("Vault this link" / "Vault this page" on a
 * site we can't script). Extension pages may call chrome.permissions.request, content scripts
 * can't — so this is where "Lock this site too" happens for non-pack sites.
 */
import { call } from '../../lib/api';
import { repo } from '../../lib/storage';
import { domainOf, originPattern } from '../../lib/url';
import type { Extraction } from '../../types';
import { h, injectStyles } from '../../ui/dom';
import { THEME_CSS } from '../../ui/theme';
import { VAULT_CARD_CSS, createVaultCard } from '../../ui/vault-card';

const PAGE_CSS = /* css */ `
html, body { margin: 0; background: var(--iv-bg); min-height: 100%; }
main { padding: 16px; max-width: 420px; margin: 0 auto; display: grid; gap: 12px; }
.iv-head { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.iv-head img { width: 22px; height: 22px; }
.iv-muted { color: var(--iv-muted); font-size: 13px; margin: 0; word-break: break-all; }
.iv-access { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--iv-line); border-radius: 14px; background: var(--iv-surface); }
.iv-access p { margin: 0; font-size: 13px; color: var(--iv-muted); }
`;

injectStyles(document, 'theme', THEME_CSS);
injectStyles(document, 'card', VAULT_CARD_CSS);
injectStyles(document, 'page', PAGE_CSS);
document.documentElement.classList.add('iv-root');

const params = new URLSearchParams(location.search);
const url = params.get('url') ?? '';
const tabId = params.get('tabId') ? Number(params.get('tabId')) : undefined;
const root = document.getElementById('root')!;

async function hasAccess(): Promise<boolean> {
  const origin = originPattern(url);
  return origin ? chrome.permissions.contains({ origins: [origin] }) : false;
}

async function extract(): Promise<Extraction | null> {
  if (tabId !== undefined) {
    const res = await call('page/extractTab', { tabId }).catch(() => null);
    if (res?.extraction) return res.extraction;
  }
  return call('scrape/url', { url }).catch(() => null);
}

async function render(): Promise<void> {
  const settings = await repo.getSettings();
  const access = await hasAccess();
  root.replaceChildren(
    h('div', { class: 'iv-head' }, h('img', { src: chrome.runtime.getURL('icons/icon-48.png'), alt: '' }), 'Vault it'),
    h('p', { class: 'iv-muted' }, url),
    h('p', { class: 'iv-muted' }, 'Reading the page…'),
  );
  const ex = await extract();

  if (!ex && !access && tabId === undefined) {
    // We can't read a page on a site we have no access to. Offer access, or manual entry.
    const allow = h('button', { class: 'iv-btn iv-btn-primary', type: 'button' }, `Allow access to ${domainOf(url)}`);
    const manual = h('button', { class: 'iv-link', type: 'button' }, 'Or type the details yourself');
    allow.addEventListener('click', () => {
      chrome.permissions.request({ origins: [originPattern(url)!] }).then(
        (ok) => {
          if (ok) void render();
        },
        () => undefined,
      );
    });
    manual.addEventListener('click', () => mountCard(null, false, settings));
    root.lastChild!.replaceWith(
      h('div', { class: 'iv-access' },
        h('p', null, `To read the price — and to lock ${domainOf(url)} while it cools off — Impulse Vault needs access to that site. Nothing leaves your browser.`),
        allow,
        manual,
      ),
    );
    return;
  }
  mountCard(ex, access, settings);
}

function mountCard(ex: Extraction | null, access: boolean, settings: Awaited<ReturnType<typeof repo.getSettings>>): void {
  const origin = originPattern(url);
  const card = createVaultCard(
    {
      url,
      title: ex?.title,
      imageUrl: ex?.imageUrl,
      price: ex?.price,
      currencyHint: ex?.price?.currency ?? settings.displayCurrency,
      confidence: ex?.confidence ?? 'low',
      productId: ex?.productId,
      packId: ex?.packId,
      soldOut: ex?.inStock === false,
      defaultCooldownHours: settings.defaultCooldownHours,
      siteAccess: access ? null : { domain: domainOf(url) },
      variant: 'page',
      sound: settings.lockSound,
    },
    {
      submit: (draft, { wantsSiteAccess }) => {
        if (wantsSiteAccess && origin) chrome.permissions.request({ origins: [origin] }).catch(() => false);
        return call('vault/create', { draft });
      },
      cancel: () => window.close(),
      done: () => window.close(),
    },
  );
  root.replaceChildren(root.firstChild!, card);
}

void render();
