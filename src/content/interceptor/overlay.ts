/**
 * The full-page interstitial, shown when a click on a buy control is intercepted.
 * Same flow as the extension's interstitial page: the note quoted back, "I'll wait" as the big
 * default, and an expensive — but always available — early unlock.
 */
import { call } from '../../lib/api';
import { SPRINGS, prefersReducedMotion } from '../../lib/spring';
import type { VaultItem } from '../../types';
import type { PageContext } from '../../types/messages';
import { h, svg } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { UNLOCK_CSS, createUnlockFlow } from '../../ui/unlock';
import { createHost, type Host } from '../ui-host';

export const OVERLAY_CSS = /* css */ `
.iv-scrim { position: fixed; inset: 0; background: rgba(19,18,22,.66); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.iv-sheet-wrap { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; overflow-y: auto; }
.iv-sheet {
  position: relative; width: 100%; max-width: 480px; background: var(--iv-surface); color: var(--iv-text);
  border-radius: 22px; padding: 26px 26px 22px; box-shadow: var(--iv-shadow); border: 1px solid var(--iv-line);
}
.iv-sheet-brand { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--iv-muted); margin-bottom: 18px; }
.iv-sheet-brand .iv-icon { color: var(--iv-brass); }
.iv-sheet-close { position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 9px; border: 0; background: transparent; color: var(--iv-muted); cursor: pointer; display: grid; place-items: center; }
.iv-sheet-close:hover { background: var(--iv-surface-2); color: var(--iv-text); }
`;

let current: { host: Host; restoreOverflow: string; destroy(): void; previousFocus: Element | null } | null = null;

export function isOverlayOpen(): boolean {
  return !!current;
}

export function closeOverlay(): void {
  if (!current) return;
  const { host, restoreOverflow, destroy, previousFocus } = current;
  current = null;
  destroy();
  document.documentElement.style.overflow = restoreOverflow;
  document.removeEventListener('keydown', onKey, true);
  const done = () => host.host.remove();
  if (prefersReducedMotion()) done();
  else host.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(done, done);
  (previousFocus as HTMLElement | null)?.focus?.();
}

function onKey(e: KeyboardEvent): void {
  if (!current) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeOverlay();
    return;
  }
  if (e.key === 'Tab') {
    // Keep focus inside the sheet.
    const focusables = [...current.host.root.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, a[href], input')];
    if (!focusables.length) return;
    const active = current.host.root.activeElement;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && (active === first || !active)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
    e.stopPropagation();
  }
}

export function showInterstitial(item: VaultItem, ctx: PageContext, onUnlocked?: () => void): void {
  if (current) return;
  const host = createHost('interstitial', [UNLOCK_CSS, OVERLAY_CSS], 'position: fixed; inset: 0; z-index: 2147483647;');
  const flow = createUnlockFlow({
    item,
    minChars: ctx.settings.unlockMinChars,
    waitSeconds: ctx.settings.unlockWaitSeconds,
    onWait: closeOverlay,
    onUnlock: async (reason) => {
      await call('vault/unlockEarly', { id: item.id, reason });
      onUnlocked?.();
      setTimeout(closeOverlay, 1600);
    },
    unlockedCopy: 'Unlocked. The button’s all yours. No judgement — this exit is here on purpose.',
  });
  const close = h('button', { class: 'iv-sheet-close', type: 'button', 'aria-label': 'Close — I’ll wait' }, svg(ICONS.close));
  close.addEventListener('click', closeOverlay);
  const sheet = h('div', { class: 'iv-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'This item is in your vault' },
    close,
    h('div', { class: 'iv-sheet-brand' }, svg(ICONS.lock), 'In your vault'),
    flow,
  );
  const scrim = h('div', { class: 'iv-scrim' });
  const wrap = h('div', { class: 'iv-sheet-wrap' }, sheet);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closeOverlay();
  });
  host.el.append(scrim, wrap);
  document.documentElement.append(host.host);

  current = {
    host,
    restoreOverflow: document.documentElement.style.overflow,
    destroy: () => flow.destroy(),
    previousFocus: document.activeElement,
  };
  document.documentElement.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey, true);

  if (!prefersReducedMotion()) {
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    sheet.animate([{ opacity: 0, transform: 'translateY(12px) scale(.97)' }, { opacity: 1, transform: 'none' }], {
      duration: SPRINGS.pop.duration,
      easing: SPRINGS.pop.easing,
    });
  }
}
