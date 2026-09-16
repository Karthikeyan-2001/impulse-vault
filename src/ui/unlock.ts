/**
 * The interstitial body: the item, the time left, and the note they wrote — quoted back.
 * "I'll wait" is the big, default action. "Unlock early" is deliberately expensive: type a
 * sentence explaining why it can't wait, then sit through a countdown before confirm enables.
 * The escape hatch is never removed — a tool that traps people gets uninstalled.
 */
import { interstitialLine, itemDelta, latestPrice } from '../lib/copy';
import { formatMoney } from '../lib/money';
import { formatCountdown, remainingMs } from '../lib/time';
import type { VaultItem } from '../types';
import { h, svg } from './dom';
import { ICONS } from './icons';

export interface UnlockFlowOptions {
  item: VaultItem;
  minChars: number;
  waitSeconds: number;
  /** Primary action label, default "I'll wait". */
  waitLabel?: string;
  onWait(): void;
  onUnlock(reason: string): Promise<void>;
  /** Shown after a successful unlock. */
  unlockedCopy?: string;
  /** Extra actions under the main buttons (e.g. "View the page anyway" on a soft gate). */
  extras?: HTMLElement[];
  compact?: boolean;
}

export const UNLOCK_CSS = /* css */ `
.iv-unlock { display: grid; gap: 18px; }
.iv-unlock-item { display: flex; gap: 14px; align-items: center; }
.iv-unlock-thumb { width: 72px; height: 72px; border-radius: 14px; border: 1px solid var(--iv-line); background: var(--iv-surface-2); object-fit: contain; flex: none; }
.iv-unlock-title { font-weight: 700; font-size: 15px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.iv-unlock-price { color: var(--iv-muted); font-size: 13px; margin-top: 2px; }
.iv-unlock-line { font-size: 22px; font-weight: 750; letter-spacing: -.015em; line-height: 1.25; margin: 0; text-wrap: balance; }
.iv-unlock-compact .iv-unlock-line { font-size: 17px; }
.iv-unlock-clock { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; color: var(--iv-brass-strong); background: var(--iv-brass-soft); border-radius: 10px; padding: 6px 10px; justify-self: start; }
.iv-quote { position: relative; margin: 0; padding: 14px 16px 14px 44px; border-radius: 14px; background: var(--iv-surface-2); font-size: 15px; line-height: 1.45; }
.iv-quote .iv-icon { position: absolute; left: 14px; top: 14px; color: var(--iv-brass); width: 20px; height: 20px; }
.iv-quote cite { display: block; margin-top: 6px; font-style: normal; font-size: 12px; color: var(--iv-muted); }
.iv-delta { font-size: 13px; color: var(--iv-muted); }
.iv-delta[data-kind="drop"] { color: var(--iv-mint); font-weight: 600; }
.iv-unlock-actions { display: grid; gap: 10px; }
.iv-unlock-actions .iv-btn-lg { width: 100%; }
.iv-unlock-secondary { display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: center; }
.iv-friction { display: grid; gap: 10px; padding: 14px; border: 1px dashed var(--iv-line); border-radius: 14px; }
.iv-friction p { margin: 0; font-size: 13px; color: var(--iv-muted); }
.iv-friction .iv-textarea { min-height: 76px; resize: vertical; }
.iv-friction-meta { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; color: var(--iv-muted); }
.iv-friction-meta [data-ok="true"] { color: var(--iv-mint); font-weight: 600; }
.iv-unlocked { text-align: center; display: grid; gap: 8px; justify-items: center; padding: 8px 0; }
.iv-unlocked strong { font-size: 18px; }
`;

export function createUnlockFlow(opts: UnlockFlowOptions): HTMLElement & { destroy(): void } {
  const { item } = opts;
  let timers: number[] = [];
  const every = (fn: () => void, ms: number) => timers.push(window.setInterval(fn, ms));
  const root = Object.assign(h('div', { class: `iv-unlock${opts.compact ? ' iv-unlock-compact' : ''}` }), {
    destroy() {
      timers.forEach(clearInterval);
      timers = [];
    },
  });

  // Item + the line
  const thumb = item.imageUrl ? h('img', { class: 'iv-unlock-thumb', src: item.imageUrl, alt: '', referrerpolicy: 'no-referrer' }) : null;
  const line = h('p', { class: 'iv-unlock-line' }, interstitialLine(item, Date.now()));
  const clock = h('div', { class: 'iv-unlock-clock iv-num', 'aria-hidden': 'true' }, svg(ICONS.lock), formatCountdown(remainingMs(item.unlockAt, Date.now())));
  every(() => {
    const now = Date.now();
    line.textContent = interstitialLine(item, now);
    clock.lastChild!.textContent = formatCountdown(remainingMs(item.unlockAt, now));
  }, 1000);

  root.append(
    h('div', { class: 'iv-unlock-item' },
      thumb,
      h('div', null,
        h('div', { class: 'iv-unlock-title' }, item.title),
        h('div', { class: 'iv-unlock-price iv-num' }, formatMoney(latestPrice(item))),
      ),
    ),
    line,
    clock,
  );
  if (item.note) {
    root.append(h('blockquote', { class: 'iv-quote' }, svg(ICONS.quote), item.note, h('cite', null, 'You, when you vaulted it')));
  }
  const delta = itemDelta(item);
  if (delta && delta.kind !== 'same') root.append(h('div', { class: 'iv-delta', 'data-kind': delta.kind }, delta.text));

  // Actions
  const waitBtn = h('button', { class: 'iv-btn iv-btn-primary iv-btn-lg', type: 'button' }, opts.waitLabel ?? 'I’ll wait');
  waitBtn.addEventListener('click', () => opts.onWait());
  const unlockLink = h('button', { class: 'iv-link', type: 'button' }, 'Unlock early');
  const secondary = h('div', { class: 'iv-unlock-secondary' }, ...(opts.extras ?? []), unlockLink);
  const actions = h('div', { class: 'iv-unlock-actions' }, waitBtn, secondary);
  root.append(actions);

  unlockLink.addEventListener('click', () => {
    unlockLink.remove();
    actions.after(friction());
  });

  function friction(): HTMLElement {
    const id = `iv-reason-${item.id.slice(0, 8)}`;
    const area = h('textarea', { class: 'iv-textarea', id, maxLength: 400, placeholder: 'This can’t wait because…', spellcheck: true });
    const count = h('span', { 'data-ok': 'false' }, `0 / ${opts.minChars}`);
    const confirm = h('button', { class: 'iv-btn iv-btn-ghost', type: 'button', disabled: true }, `Unlock in ${opts.waitSeconds}s`);
    const err = h('p', { role: 'alert', hidden: true, style: 'color: var(--iv-danger)' });
    let secondsLeft = opts.waitSeconds;
    let ticking: number | null = null;

    const render = () => {
      const len = area.value.trim().length;
      const ok = len >= opts.minChars;
      count.textContent = ok ? 'That’s a reason.' : `${len} / ${opts.minChars}`;
      count.dataset.ok = String(ok);
      if (!ok) {
        // Friction resets if the reason stops being one.
        if (ticking !== null) clearInterval(ticking);
        ticking = null;
        secondsLeft = opts.waitSeconds;
        confirm.disabled = true;
        confirm.textContent = `Unlock in ${secondsLeft}s`;
        return;
      }
      if (ticking === null && secondsLeft > 0) {
        ticking = window.setInterval(() => {
          secondsLeft -= 1;
          if (secondsLeft <= 0) {
            clearInterval(ticking!);
            timers = timers.filter((t) => t !== ticking);
            confirm.disabled = false;
            confirm.textContent = 'Unlock it';
          } else {
            confirm.textContent = `Unlock in ${secondsLeft}s`;
          }
        }, 1000);
        timers.push(ticking);
      }
    };
    area.addEventListener('input', render);
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      err.hidden = true;
      opts.onUnlock(area.value.trim()).then(
        () => {
          root.destroy();
          root.replaceChildren(
            h('div', { class: 'iv-unlocked', role: 'status' },
              h('strong', null, 'Unlocked.'),
              h('span', { style: 'color: var(--iv-muted)' }, opts.unlockedCopy ?? 'It’s yours to buy. No judgement — this exit is here on purpose.'),
            ),
          );
        },
        (e: unknown) => {
          confirm.disabled = false;
          err.textContent = e instanceof Error ? e.message : 'Couldn’t unlock. Try again.';
          err.hidden = false;
        },
      );
    });
    queueMicrotask(() => area.focus());
    return h('div', { class: 'iv-friction' },
      h('label', { class: 'iv-label', htmlFor: id, style: 'margin:0' }, 'Explain why this can’t wait'),
      h('p', null, `At least ${opts.minChars} characters. Then a ${opts.waitSeconds}-second pause, and it’s yours.`),
      area,
      h('div', { class: 'iv-friction-meta' }, count, confirm),
      err,
    );
  }

  queueMicrotask(() => waitBtn.focus());
  return root;
}
