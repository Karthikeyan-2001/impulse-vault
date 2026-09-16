/**
 * Layers 3 & 4 of the lock: click interception and the form-submit guard, for when the user
 * is on a live product page (they passed the soft gate, or it was an SPA route change).
 *
 * This is a speed bump for autopilot, not a wall. Sites re-render, and a determined user will
 * always win — which is fine. The DNR cart/checkout block is the layer that actually stops
 * purchases. See DECISIONS.md.
 */
import type { VaultItem } from '../../types';
import type { PageContext } from '../../types/messages';
import { matchBuyControl } from '../detect';
import { showInterstitial } from './overlay';

type GetCtx = () => PageContext | null;

/** Which cooling item a buy control on this page would purchase, if any. */
function lockedItem(ctx: PageContext): VaultItem | null {
  const item = ctx.item;
  return item && item.state === 'cooling' && item.lockEnabled ? item : null;
}

function decide(target: EventTarget | null, ctx: PageContext): { item: VaultItem } | null {
  const item = lockedItem(ctx);
  if (item && matchBuyControl(target, ctx.pack)) return { item };
  // Elsewhere on a domain holding a cooling item: only checkout-type controls, and only
  // without a cart pass ("something else in my cart").
  if (!item && !ctx.cartPass && ctx.coolingOnDomain.length && matchBuyControl(target, ctx.pack, { checkoutOnly: true })) {
    return { item: ctx.coolingOnDomain[0]! };
  }
  return null;
}

function stop(e: Event): void {
  e.preventDefault();
  e.stopImmediatePropagation();
  e.stopPropagation();
}

export function armInterceptor(getCtx: GetCtx, onUnlocked: () => void): void {
  // Some sites act on press, not click: swallow the press so their handlers never see it.
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend']) {
    window.addEventListener(
      type,
      (e) => {
        const ctx = getCtx();
        if (ctx && decide(e.target, ctx)) e.stopImmediatePropagation();
      },
      { capture: true, passive: type.startsWith('touch') ? false : undefined },
    );
  }

  window.addEventListener(
    'click',
    (e) => {
      const ctx = getCtx();
      const hit = ctx && decide(e.target, ctx);
      if (!ctx || !hit) return;
      stop(e);
      showInterstitial(hit.item, ctx, onUnlocked);
    },
    true,
  );

  window.addEventListener(
    'submit',
    (e) => {
      const ctx = getCtx();
      if (!ctx) return;
      const form = e.target as HTMLFormElement;
      const submitter = (e as SubmitEvent).submitter ?? null;
      const item = lockedItem(ctx);
      const cartish = /cart|checkout|basket|bag|buy|order/i.test(form.getAttribute('action') ?? '');
      let hit = submitter ? decide(submitter, ctx) : null;
      if (!hit && item && cartish) hit = { item };
      if (!hit && item) {
        // A form that contains a matched buy control is a buy form.
        const control = form.querySelector('button, input[type="submit"]');
        if (control && matchBuyControl(control, ctx.pack)) hit = { item };
      }
      if (!hit) return;
      stop(e);
      showInterstitial(hit.item, ctx, onUnlocked);
    },
    true,
  );
}
