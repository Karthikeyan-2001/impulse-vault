/**
 * F1 on the page: a "Vault it — 72h" button right next to Add to Cart, the inline vault card,
 * and — once vaulted — the Add to Cart area replaced by a locked countdown.
 *
 * The button borrows the height and corner radius of the site's own button so it reads as
 * deliberate and native-adjacent, but it's ink-and-brass so it never looks like an ad.
 */
import { call } from '../../lib/api';
import { SPRINGS, prefersReducedMotion } from '../../lib/spring';
import { formatCountdown, formatRemaining, presetLabel, remainingMs } from '../../lib/time';
import type { VaultItem } from '../../types';
import type { PageContext } from '../../types/messages';
import { h, svg } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { VAULT_CARD_CSS, createVaultCard } from '../../ui/vault-card';
import { findAddButtons, findAnchor, hideTarget } from '../detect';
import type { ExtractResult } from '../extractor';
import { createHost, pageStyle, type Host } from '../ui-host';

const BUTTON_CSS = /* css */ `
.iv-vbtn {
  display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
  height: var(--iv-h, 40px); border-radius: var(--iv-r, 999px); padding: 0 16px;
  border: 1px solid #1d1b22; background: #1d1b22; color: #f7f4ee;
  font: 650 14px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 1px 2px rgba(0,0,0,.18);
  transition: transform .12s ease, background-color .15s ease;
}
.iv-vbtn:hover { background: #2b2831; }
.iv-vbtn:active { transform: scale(.98); }
.iv-vbtn .iv-icon { color: #d9ab4f; width: 17px; height: 17px; }
.iv-vbtn span.iv-dim { opacity: .65; font-weight: 550; }
.iv-locked {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: var(--iv-h, 40px);
  border-radius: var(--iv-r, 999px); padding: 0 16px; cursor: pointer;
  background: repeating-linear-gradient(-45deg, #25222b 0 10px, #2b2831 10px 20px);
  border: 1px solid #3a3642; color: #f3e6c8; font: 650 14px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-align: left;
}
.iv-locked .iv-icon { color: #d9ab4f; width: 17px; height: 17px; }
.iv-locked .iv-count { margin-left: auto; color: #d9ab4f; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.iv-locked-note { font-size: 12px; color: var(--iv-muted); margin: 6px 6px 0; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iv-locked-note b { font-style: normal; font-weight: 600; }
.iv-popover { position: relative; }
`;

let buttonHost: Host | null = null;
let lockedHost: Host | null = null;
let cardHost: Host | null = null;
let lockedTimer: number | null = null;
let hidden: Element[] = [];
/** What the button's click should vault: always the latest page state (SPA navigation). */
let latest: { ctx: PageContext; ex: ExtractResult } | null = null;
/** Between "Lock it" and the end of the drop animation. Re-renders must not yank the card. */
let cardBusy = false;

export function isCardBusy(): boolean {
  return cardBusy;
}

/** Height/radius of the site's own button, so ours sits naturally next to it. */
function borrowShape(from: Element | null, host: HTMLElement): void {
  const btn = from?.matches('button, input, a, [role="button"]') ? from : from?.querySelector('button, input[type="submit"], a, [role="button"]');
  if (!btn) return;
  const cs = getComputedStyle(btn);
  const hgt = (btn as HTMLElement).getBoundingClientRect().height;
  if (hgt >= 28 && hgt <= 64) host.style.setProperty('--iv-h', `${Math.round(hgt)}px`);
  if (cs.borderRadius && cs.borderRadius !== '0px') host.style.setProperty('--iv-r', cs.borderRadius);
}

function placeAfter(anchor: Element, host: HTMLElement): void {
  if (anchor.nextElementSibling !== host) anchor.insertAdjacentElement('afterend', host);
}

// ── Vault button ──────────────────────────────────────────────────────────

export function showVaultButton(ctx: PageContext, ex: ExtractResult): void {
  const anchor = findAnchor(ctx.pack);
  if (!anchor) return removeVaultButton();
  latest = { ctx, ex };
  if (!buttonHost) {
    buttonHost = createHost('vault-button', [BUTTON_CSS], 'margin: 8px 0; max-width: 100%;');
    const btn = h('button', { class: 'iv-vbtn', type: 'button', title: 'Put it in the vault. Decide later, with a clear head.' },
      svg(ICONS.lock),
      'Vault it',
      h('span', { class: 'iv-dim' }, `— ${presetLabel(ctx.settings.defaultCooldownHours)}`),
    );
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (latest && buttonHost) openCard(latest.ctx, latest.ex, buttonHost.host);
    });
    buttonHost.el.append(btn);
  }
  const width = (anchor as HTMLElement).getBoundingClientRect().width;
  if (width > 120) buttonHost.host.style.width = `${Math.round(width)}px`;
  borrowShape(anchor, buttonHost.host);
  placeAfter(anchor, buttonHost.host);
}

export function removeVaultButton(): void {
  buttonHost?.host.remove();
  buttonHost = null;
}

// ── Inline card ───────────────────────────────────────────────────────────

export function openCard(ctx: PageContext, ex: ExtractResult, near: Element | null): void {
  closeCard();
  const host = createHost('vault-card', [VAULT_CARD_CSS], 'position: absolute; z-index: 2147483646;');
  cardHost = host;
  const card = createVaultCard(
    {
      url: location.href,
      title: ex.title,
      imageUrl: ex.imageUrl,
      price: ex.price,
      currencyHint: ex.price?.currency ?? ctx.pack?.currency ?? 'INR',
      confidence: ex.confidence,
      productId: ex.productId,
      packId: ex.packId,
      soldOut: ex.inStock === false,
      defaultCooldownHours: ctx.settings.defaultCooldownHours,
      siteAccess: null,
      variant: 'inline',
      sound: ctx.settings.lockSound,
    },
    {
      submit: (draft) => {
        cardBusy = true;
        return call('vault/create', { draft }).catch((e: unknown) => {
          cardBusy = false;
          throw e;
        });
      },
      cancel: () => closeCard(),
      done: () => {
        cardBusy = false;
        closeCard(true);
      },
    },
  );
  host.el.append(h('div', { class: 'iv-popover' }, card));
  document.documentElement.append(host.host);

  // Position under the anchor (page coordinates), clamped to the viewport; else top-right.
  const r = near?.getBoundingClientRect();
  const cardW = Math.min(352, innerWidth - 24);
  if (r && r.width > 0) {
    host.host.style.top = `${Math.round(r.bottom + scrollY + 8)}px`;
    host.host.style.left = `${Math.round(Math.min(Math.max(r.left + scrollX, 12 + scrollX), innerWidth - cardW - 12 + scrollX))}px`;
  } else {
    host.host.style.position = 'fixed';
    host.host.style.top = '16px';
    host.host.style.right = '16px';
  }
  if (!prefersReducedMotion()) {
    card.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], {
      duration: SPRINGS.pop.duration,
      easing: SPRINGS.pop.easing,
    });
  }
  requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
}

function onOutside(e: PointerEvent): void {
  if (cardHost && !e.composedPath().includes(cardHost.host)) closeCard();
}

export function closeCard(fade = false): void {
  if (cardBusy) return;
  document.removeEventListener('pointerdown', onOutside, true);
  const host = cardHost;
  cardHost = null;
  if (!host) return;
  if (fade && !prefersReducedMotion()) {
    host.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(() => host.host.remove());
  } else {
    host.host.remove();
  }
}

// ── Locked state ──────────────────────────────────────────────────────────

/** Replace the buy buttons with a locked countdown. Clicking it opens the interstitial. */
export function showLocked(ctx: PageContext, item: VaultItem, onOpen: () => void): void {
  removeVaultButton();
  pageStyle();
  // Measure and place while everything is still visible (re-renders can bring buttons back).
  for (const el of hidden) el.removeAttribute('data-impulse-vault-hidden');
  const buttons = findAddButtons(ctx.pack);
  const anchor = findAnchor(ctx.pack) ?? buttons[0] ?? null;
  const toHide = buttons.map(hideTarget);
  // A pack's anchor is usually the whole add-to-cart block (Amazon's #addToCart_feature_div): hide it too.
  if (anchor && buttons.some((b) => anchor.contains(b))) toHide.push(anchor);
  hidden = toHide;
  if (!anchor && !lockedHost?.host.isConnected) {
    for (const el of hidden) el.setAttribute('data-impulse-vault-hidden', '');
    return; // nothing to replace; the banner + interceptor still cover it
  }

  const fresh = !lockedHost;
  if (!lockedHost) {
    lockedHost = createHost('locked', [BUTTON_CSS], 'margin: 8px 0; max-width: 100%;');
    const count = h('span', { class: 'iv-count' });
    const pill = h('button', { class: 'iv-locked', type: 'button' }, svg(ICONS.lock), h('span', { class: 'iv-locked-label' }), count);
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onOpen();
    });
    lockedHost.el.append(pill);
  }
  if (anchor && !lockedHost.host.isConnected) {
    borrowShape(anchor, lockedHost.host);
    const width = (anchor as HTMLElement).getBoundingClientRect().width;
    if (width > 120) lockedHost.host.style.width = `${Math.round(width)}px`;
    // Insert before hiding, so it takes the same spot.
    placeAfter(anchor, lockedHost.host);
  }
  for (const el of hidden) if (!el.contains(lockedHost.host)) el.setAttribute('data-impulse-vault-hidden', '');

  const pill = lockedHost.el.querySelector('.iv-locked')!;
  const label = pill.querySelector('.iv-locked-label')!;
  const count = pill.querySelector('.iv-count')!;
  lockedHost.el.querySelector('.iv-locked-note')?.remove();
  if (item.note) {
    lockedHost.el.append(h('div', { class: 'iv-locked-note' }, h('b', null, 'You wanted it because: '), `“${item.note}”`));
  }
  // Buy boxes are narrow: the pill says "Locked" + the clock; the banner carries the words.
  const roomy = (lockedHost.host.getBoundingClientRect().width || 0) >= 320;
  const tick = () => {
    const left = remainingMs(item.unlockAt, Date.now());
    label.textContent = roomy ? `Locked — back in ${formatRemaining(left)}` : 'Locked';
    count.textContent = formatCountdown(left);
    pill.setAttribute('aria-label', `Locked. ${formatRemaining(left)} to go. Open options.`);
  };
  tick();
  if (lockedTimer !== null) clearInterval(lockedTimer);
  lockedTimer = window.setInterval(tick, 1000);

  if (fresh && Date.now() - item.vaultedAt < 5000 && !prefersReducedMotion()) {
    pill.animate([{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
      duration: SPRINGS.pop.duration,
      easing: SPRINGS.pop.easing,
    });
  }
}

export function removeLocked(): void {
  if (lockedTimer !== null) clearInterval(lockedTimer);
  lockedTimer = null;
  lockedHost?.host.remove();
  lockedHost = null;
  for (const el of hidden) el.removeAttribute('data-impulse-vault-hidden');
  hidden = [];
}

/** Our hosts were removed by a site re-render? */
export function needsReattach(): boolean {
  return (!!buttonHost && !buttonHost.host.isConnected) || (!!lockedHost && !lockedHost.host.isConnected);
}
