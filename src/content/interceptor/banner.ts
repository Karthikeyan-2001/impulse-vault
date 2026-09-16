/**
 * The persistent slim banner on a vaulted product's page: "Vaulted — 41 hours to go."
 * When the timer's done it becomes the verdict. After a "yes", a short release note.
 */
import { call } from '../../lib/api';
import { declineCopy, releaseCopy } from '../../lib/copy';
import { formatMoney } from '../../lib/money';
import { SPRINGS, prefersReducedMotion } from '../../lib/spring';
import { payoutAmount } from '../../lib/state';
import { formatRemaining, remainingMs } from '../../lib/time';
import type { VaultItem } from '../../types';
import { h, svg } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { createHost, type Host } from '../ui-host';

const BANNER_CSS = /* css */ `
.iv-bar {
  display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 5px 10px 5px 14px;
  background: #1d1b22; color: #f3eee4; font-size: 13.5px; line-height: 1.3;
  box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 6px 18px -8px rgba(0,0,0,.45);
}
.iv-bar .iv-icon { color: #d9ab4f; width: 16px; height: 16px; }
.iv-bar b { font-weight: 700; }
.iv-bar-note { color: #b9b2a5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; font-style: italic; }
.iv-bar-spacer { flex: 1; }
.iv-bar-btn { height: 26px; padding: 0 11px; border-radius: 7px; border: 1px solid #3a3642; background: transparent; color: #f3eee4; font-weight: 650; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.iv-bar-btn:hover { background: #2b2831; }
.iv-bar-btn.iv-mint { background: #52c392; border-color: #52c392; color: #0c2419; }
.iv-bar-btn.iv-mint:hover { background: #63cf9f; }
.iv-bar-x { width: 26px; height: 26px; border: 0; border-radius: 7px; background: transparent; color: #8f887c; cursor: pointer; display: grid; place-items: center; }
.iv-bar-x:hover { background: #2b2831; color: #f3eee4; }
.iv-bar-x .iv-icon { color: inherit; width: 14px; height: 14px; }
.iv-pill {
  display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px;
  background: #1d1b22; color: #f3eee4; border: 1px solid #3a3642; font-size: 13px; font-weight: 650; cursor: pointer;
  box-shadow: 0 8px 22px -8px rgba(0,0,0,.5);
}
.iv-pill .iv-icon { color: #d9ab4f; width: 15px; height: 15px; }
@media (max-width: 640px) { .iv-bar-note { display: none; } }
`;

let host: Host | null = null;
let timer: number | null = null;
let collapsed = false;
let shownFor = '';

function ensureHost(): Host {
  if (host?.host.isConnected) return host;
  host = createHost('banner', [BANNER_CSS], 'position: fixed; top: 0; left: 0; right: 0; z-index: 2147483645;');
  document.documentElement.append(host.host);
  return host;
}

function clearTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

export function hideBanner(): void {
  clearTimer();
  host?.host.remove();
  host = null;
  shownFor = '';
}

function slideIn(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  el.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: SPRINGS.soft.duration, easing: SPRINGS.soft.easing });
}

export function showCoolingBanner(item: VaultItem, onDetails: () => void): void {
  const key = `cooling:${item.id}:${collapsed}`;
  const hst = ensureHost();
  if (shownFor === key && hst.el.firstChild) return;
  shownFor = key;
  clearTimer();

  if (collapsed) {
    hst.host.style.cssText = 'position: fixed; top: 12px; right: 12px; left: auto; z-index: 2147483645;';
    const label = h('span');
    const pill = h('button', { class: 'iv-pill', type: 'button', title: 'Show the vault banner' }, svg(ICONS.lock), label);
    pill.addEventListener('click', () => {
      collapsed = false;
      showCoolingBanner(item, onDetails);
    });
    const tick = () => (label.textContent = formatRemaining(remainingMs(item.unlockAt, Date.now())));
    tick();
    timer = window.setInterval(tick, 30_000);
    hst.el.replaceChildren(pill);
    return;
  }

  hst.host.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 2147483645;';
  const left = h('b');
  const tick = () => (left.textContent = `Vaulted — ${formatRemaining(remainingMs(item.unlockAt, Date.now()))} to go.`);
  tick();
  timer = window.setInterval(tick, 30_000);
  const details = h('button', { class: 'iv-bar-btn', type: 'button' }, 'Details');
  details.addEventListener('click', onDetails);
  const x = h('button', { class: 'iv-bar-x', type: 'button', 'aria-label': 'Minimise banner', title: 'Minimise' }, svg(ICONS.close));
  x.addEventListener('click', () => {
    collapsed = true;
    showCoolingBanner(item, onDetails);
  });
  const bar = h('div', { class: 'iv-bar', role: 'status' },
    svg(ICONS.lock),
    left,
    item.note ? h('span', { class: 'iv-bar-note' }, `“${item.note}”`) : h('span', { class: 'iv-bar-spacer' }),
    details,
    x,
  );
  hst.el.replaceChildren(bar);
  slideIn(bar);
}

export function showRipeBanner(item: VaultItem): void {
  const key = `ripe:${item.id}`;
  const hst = ensureHost();
  if (shownFor === key && hst.el.firstChild) return;
  shownFor = key;
  clearTimer();
  hst.host.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 2147483645;';
  const payout = payoutAmount(item);
  const yes = h('button', { class: 'iv-bar-btn', type: 'button' }, 'Yes, buy it');
  const no = h('button', { class: 'iv-bar-btn iv-mint', type: 'button' }, `No, save ${formatMoney(payout)}`);
  const text = h('b', null, item.soldOut ? 'This sold out while you waited.' : 'The wait’s over. Do you still want this?');
  const bar = h('div', { class: 'iv-bar', role: 'status' }, svg(ICONS.unlock), text, h('span', { class: 'iv-bar-spacer' }), yes, no);
  yes.addEventListener('click', () => {
    yes.disabled = no.disabled = true;
    call('vault/release', { id: item.id }).then((released) => {
      text.textContent = releaseCopy(released);
      yes.remove();
      no.remove();
      setTimeout(hideBanner, 5000);
    }, () => (yes.disabled = no.disabled = false));
  });
  no.addEventListener('click', () => {
    yes.disabled = no.disabled = true;
    call('vault/decline', { id: item.id }).then(() => {
      text.textContent = `${declineCopy(payout)} It’s on your stack.`;
      yes.remove();
      no.remove();
      setTimeout(hideBanner, 5000);
    }, () => (yes.disabled = no.disabled = false));
  });
  hst.el.replaceChildren(bar);
  slideIn(bar);
}

/** After a "yes" (from the popup or notification): one warm line, then out of the way. */
export function showReleasedToast(item: VaultItem): void {
  const key = `released:${item.id}`;
  if (shownFor === key) return;
  const hst = ensureHost();
  shownFor = key;
  clearTimer();
  hst.host.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 2147483645;';
  const x = h('button', { class: 'iv-bar-x', type: 'button', 'aria-label': 'Dismiss' }, svg(ICONS.close));
  x.addEventListener('click', hideBanner);
  const bar = h('div', { class: 'iv-bar', role: 'status' }, svg(ICONS.unlock), h('b', null, releaseCopy(item)), h('span', { class: 'iv-bar-spacer' }), x);
  hst.el.replaceChildren(bar);
  slideIn(bar);
  setTimeout(() => {
    if (shownFor === key) hideBanner();
  }, 7000);
}
