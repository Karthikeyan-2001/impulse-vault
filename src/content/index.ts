/**
 * Content script. Plain TypeScript, no framework, everything rendered in closed shadow roots.
 * Injected statically on supported retailers, dynamically on sites the user granted, and on
 * demand (activeTab) from the popup or context menu.
 *
 * Lifecycle: ask the worker for this URL's context → render one of
 *   · Vault button (a product page, not vaulted)
 *   · Locked countdown + banner + armed interceptor (cooling)
 *   · Verdict banner (ripe)
 * and do it again on SPA route changes, storage changes, and site re-renders.
 */
import { call } from '../lib/api';
import { repo } from '../lib/storage';
import { hostMatchesDomain } from '../lib/url';
import type { ContentMessage, PageContext } from '../types/messages';
import { extractProduct, looksLikeProductPage, type ExtractResult } from './extractor';
import { armInterceptor } from './interceptor';
import { hideBanner, showCoolingBanner, showReleasedToast, showRipeBanner } from './interceptor/banner';
import { closeOverlay, isOverlayOpen, showInterstitial } from './interceptor/overlay';
import { domReady } from './ui-host';
import { closeCard, hasVaultButton, needsReattach, openCard, removeLocked, removeVaultButton, showLocked, showVaultButton } from './vault-button';

const flag = window as unknown as { __impulseVaultContent?: boolean };
if (!flag.__impulseVaultContent) {
  flag.__impulseVaultContent = true;
  boot();
}

let ctx: PageContext | null = null;
let ex: ExtractResult | null = null;
let lastUrl = location.href;
let navStartedAt = Date.now();
let healthReportedFor = '';

function boot(): void {
  chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
    switch (msg.type) {
      case 'content/ping':
        sendResponse(true);
        return false;
      case 'content/extract':
        // Asked directly (popup, context menu): make sure we have packs, then extract.
        void (async () => {
          if (!ctx) await refresh({ force: true });
          sendResponse(extract(msg.pack));
        })();
        return true;
      case 'content/openVaultCard':
        void openCardFromMenu().then(sendResponse);
        return true;
      default:
        return false;
    }
  });

  // Armed before the page can be clicked; it consults the latest context on every event.
  armInterceptor(() => ctx, () => void refresh());

  window.addEventListener('impulse-vault:locationchange', onMaybeNavigated);
  window.addEventListener('popstate', onMaybeNavigated);
  window.addEventListener('hashchange', onMaybeNavigated);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('vault:items' in changes || 'vault:settings' in changes || 'vault:packs' in changes)) schedule(refresh, 120);
  });

  void domReady().then(() => {
    observeDom();
    void refresh();
  });
  window.addEventListener('load', () => setTimeout(reportPackHealth, 2000), { once: true });
}

function extract(pack = ctx?.pack) {
  return extractProduct(document, location.href, { pack, platformPacks: ctx?.platformPacks, live: true });
}

/**
 * With access to every site, this runs on every page you open — so decide cheaply whether the
 * page can matter at all before waking the worker: does this domain hold a vaulted item, and
 * does the page even look like a product page? Both are a handful of indexed lookups.
 */
async function worthWaking(): Promise<boolean> {
  try {
    const domains = await repo.getIndexedDomains();
    if (domains.some((d) => hostMatchesDomain(location.hostname, d))) return true;
  } catch {
    /* storage unavailable: fall through and let the worker decide */
  }
  return looksLikeProductPage(document);
}

// ── Scheduling ────────────────────────────────────────────────────────────

const timers = new Map<() => unknown, number>();
function schedule(fn: () => unknown, ms: number): void {
  clearTimeout(timers.get(fn));
  timers.set(fn, window.setTimeout(fn, ms));
}

function onMaybeNavigated(): void {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  navStartedAt = Date.now();
  ex = null;
  closeCard();
  if (isOverlayOpen()) closeOverlay();
  removeVaultButton();
  removeLocked();
  hideBanner();
  schedule(refresh, 60);
}

function observeDom(): void {
  new MutationObserver(() => {
    if (location.href !== lastUrl) return onMaybeNavigated();
    // Site re-rendered our button away, or the product UI arrived late. Client-rendered stores
    // often announce the product in JSON-LD immediately but paint the buy button seconds later,
    // so keep looking while there's still nowhere to put the button.
    const settling = Date.now() - navStartedAt < 20_000;
    const missingButton = !!ctx && !ctx.item && (!ex?.isProductPage || !hasVaultButton());
    if (needsReattach() || (settling && missingButton)) schedule(render, 350);
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// ── Refresh & render ──────────────────────────────────────────────────────

async function refresh(opts: { force?: boolean } = {}): Promise<void> {
  const url = location.href;
  if (!opts.force && !(await worthWaking())) return;
  const next = await call('page/context', { url }).catch(() => null);
  if (!next || url !== location.href) return;
  ctx = next;
  render();
}

function render(): void {
  if (!ctx) return;
  const item = ctx.item;
  const onDetails = () => item && showInterstitial(item, ctx!, () => void refresh());

  if (item?.state === 'cooling') {
    removeVaultButton();
    closeCard();
    if (item.lockEnabled) showLocked(ctx, item, onDetails);
    showCoolingBanner(item, onDetails);
    return;
  }
  removeLocked();
  if (item?.state === 'ripe') {
    removeVaultButton();
    showRipeBanner(item);
    return;
  }
  if (ctx.released) showReleasedToast(ctx.released);
  else hideBanner();

  ex = extract();
  if (ex.isProductPage) showVaultButton(ctx, ex);
  else removeVaultButton();
}

async function openCardFromMenu(): Promise<boolean> {
  // Asked for by name, so skip the "is this worth waking for?" check.
  if (!ctx) await refresh({ force: true });
  if (!ctx) return false;
  const extraction = extract();
  const near = document.querySelector('impulse-vault[data-part="vault-button"]');
  openCard(ctx, extraction, near);
  return true;
}

/** Tell the worker whether this pack's selectors still work (quiet "may be outdated" note in Options). */
function reportPackHealth(): void {
  if (!ctx?.pack || healthReportedFor === location.href) return;
  const result = ex ?? extract();
  if (!result.productId) return;
  healthReportedFor = location.href;
  void call('page/packHealth', { packId: ctx.pack.id, hit: !result.packMissed }).catch(() => undefined);
}
