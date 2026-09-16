/**
 * The vault card: edit what was scraped, say why you want it, pick a cooldown, lock it.
 * Framework-free so the same card runs in a retailer page's shadow root, the popup and the
 * vault window.
 *
 * The confirm animation is product design, not decoration: vaulting has to feel as satisfying
 * as adding to cart. The card lifts, then drops into a vault door on a spring (~400ms), the
 * wheel spins shut, and only then does the copy say "Locked."
 */
import { currencySymbol, formatAmountInput, parseMoneyInput, type Money } from '../lib/money';
import { SPRINGS, prefersReducedMotion } from '../lib/spring';
import { COOLDOWN_PRESETS, describeWhen, formatRemaining, remainingMs } from '../lib/time';
import type { Confidence, VaultDraft } from '../types';
import type { CreateResult } from '../types/messages';
import { h, svg, wait } from './dom';
import { ICONS, VAULT_DOOR } from './icons';
import { playLockSound } from './sound';

export interface VaultCardInit {
  url: string;
  title?: string;
  imageUrl?: string;
  price?: Money;
  currencyHint: string;
  confidence: Confidence;
  productId?: string;
  packId?: string;
  soldOut?: boolean;
  defaultCooldownHours: number;
  /** Present when the extension can't lock this site yet: offer to ask for access. */
  siteAccess?: { domain: string } | null;
  variant: 'inline' | 'popup' | 'page';
  sound: boolean;
}

export interface VaultCardHandlers {
  /** Called synchronously from the click, so it may call chrome.permissions.request first. */
  submit(draft: VaultDraft, opts: { wantsSiteAccess: boolean }): Promise<CreateResult>;
  cancel(): void;
  done?(result: CreateResult): void;
}

export function cooldownWords(hours: number): string {
  if (hours >= 48 && hours % 24 === 0 && hours !== 72) return `${hours / 24} days`;
  return `${hours} hours`;
}

export const VAULT_CARD_CSS = /* css */ `
.iv-card {
  position: relative; width: 352px; max-width: calc(100vw - 24px);
  background: var(--iv-surface); color: var(--iv-text);
  border: 1px solid var(--iv-line); border-radius: 16px; box-shadow: var(--iv-shadow);
  overflow: hidden; transition: height .35s cubic-bezier(.2,.8,.2,1);
}
.iv-card[data-variant="popup"], .iv-card[data-variant="page"] { width: 100%; max-width: none; box-shadow: none; }
.iv-card-body { transform-origin: 50% 50%; }
.iv-card-head { display: flex; gap: 12px; padding: 14px 14px 10px; }
.iv-thumb {
  width: 68px; height: 68px; flex: none; border-radius: 12px; border: 1px solid var(--iv-line);
  background: var(--iv-surface-2); object-fit: contain; display: block;
}
.iv-thumb-empty { display: grid; place-items: center; color: var(--iv-muted); }
.iv-head-fields { flex: 1; min-width: 0; }
.iv-title-input {
  display: block; width: 100%; resize: none; overflow: hidden; border: 1px solid transparent; background: transparent;
  font-weight: 650; font-size: 14px; line-height: 1.35; border-radius: 8px; padding: 3px 6px; margin: -3px -6px 0;
  max-height: 58px;
}
.iv-title-input:hover, .iv-title-input:focus { border-color: var(--iv-line); background: var(--iv-surface-2); }
.iv-price-row { display: flex; align-items: baseline; gap: 2px; margin-top: 6px; }
.iv-price-sym { font-size: 20px; font-weight: 700; color: var(--iv-muted); }
.iv-price-input {
  width: 140px; font-size: 22px; font-weight: 750; letter-spacing: -.01em; border: 1px solid transparent;
  background: transparent; border-radius: 8px; padding: 0 6px; margin-left: -2px; font-variant-numeric: tabular-nums;
}
.iv-price-input:hover, .iv-price-input:focus { border-color: var(--iv-line); background: var(--iv-surface-2); }
.iv-price-input[aria-invalid="true"] { border-color: var(--iv-danger); }
.iv-flag {
  display: flex; gap: 8px; align-items: flex-start; margin: 0 14px 10px; padding: 8px 10px; border-radius: 10px;
  background: var(--iv-warn-soft); color: var(--iv-warn); font-size: 12.5px; line-height: 1.4;
}
.iv-flag .iv-icon { margin-top: 1px; }
.iv-field { padding: 2px 14px 12px; }
.iv-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 14px 12px; }
.iv-row .iv-label { margin: 0; }
.iv-seg { display: inline-grid; grid-auto-flow: column; gap: 2px; background: var(--iv-surface-2); border-radius: 10px; padding: 3px; }
.iv-seg button {
  height: 28px; min-width: 44px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent;
  font-weight: 650; font-size: 13px; color: var(--iv-muted); cursor: pointer;
}
.iv-seg button[aria-checked="true"] { background: var(--iv-surface); color: var(--iv-text); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.iv-check { display: flex; gap: 9px; align-items: flex-start; padding: 0 14px 10px; font-size: 12.5px; color: var(--iv-muted); cursor: pointer; }
.iv-check input { margin-top: 2px; accent-color: var(--iv-brass); width: 15px; height: 15px; flex: none; }
.iv-check strong { color: var(--iv-text); font-weight: 650; }
.iv-error { color: var(--iv-danger); font-size: 12.5px; padding: 0 14px 10px; }
.iv-actions {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 12px 14px; border-top: 1px solid var(--iv-line); background: var(--iv-surface-2);
}
.iv-actions .iv-btn-primary { min-width: 132px; }
.iv-stage {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; pointer-events: none; padding: 16px; text-align: center;
}
.iv-door { width: 92px; height: 92px; }
.iv-stage-msg { font-weight: 750; font-size: 17px; letter-spacing: -.01em; opacity: 0; }
.iv-stage-sub { color: var(--iv-muted); font-size: 13px; margin-top: -8px; opacity: 0; }
.iv-dup { padding: 18px 16px 16px; display: grid; gap: 12px; justify-items: start; }
.iv-dup-title { font-weight: 700; font-size: 15px; }
.iv-dup p { margin: 0; color: var(--iv-muted); }
`;

export function createVaultCard(init: VaultCardInit, handlers: VaultCardHandlers): HTMLElement {
  const currency = init.price?.currency ?? init.currencyHint;
  let cooldown = init.defaultCooldownHours;

  const card = h('div', { class: 'iv-card', 'data-variant': init.variant, role: 'dialog', 'aria-label': 'Vault this item' });
  const body = h('div', { class: 'iv-card-body' });

  // ── Header: image, title, price ──────────────────────────────────────────
  const thumb = init.imageUrl
    ? h('img', { class: 'iv-thumb', src: init.imageUrl, alt: '', referrerpolicy: 'no-referrer' })
    : h('div', { class: 'iv-thumb iv-thumb-empty' }, svg(ICONS.lock));
  if (thumb instanceof HTMLImageElement) {
    thumb.addEventListener('error', () => thumb.replaceWith(h('div', { class: 'iv-thumb iv-thumb-empty' }, svg(ICONS.lock))));
  }
  const titleInput = h('textarea', {
    class: 'iv-title-input',
    rows: 2,
    maxLength: 300,
    'aria-label': 'Item name',
    spellcheck: false,
  });
  titleInput.value = init.title ?? '';
  const autosize = () => {
    titleInput.style.height = 'auto';
    titleInput.style.height = `${Math.min(titleInput.scrollHeight, 58)}px`;
  };
  titleInput.addEventListener('input', autosize);

  const priceInput = h('input', {
    class: 'iv-price-input',
    type: 'text',
    inputmode: 'decimal',
    'aria-label': `Price in ${currency}`,
    placeholder: '0',
    autocomplete: 'off',
  });
  priceInput.value = init.price ? formatAmountInput(init.price) : '';

  body.append(
    h('div', { class: 'iv-card-head' },
      thumb,
      h('div', { class: 'iv-head-fields' },
        titleInput,
        h('div', { class: 'iv-price-row' }, h('span', { class: 'iv-price-sym' }, currencySymbol(currency)), priceInput),
      ),
    ),
  );

  if (init.confidence === 'low' || !init.price) {
    body.append(
      h('div', { class: 'iv-flag', role: 'note' },
        svg(ICONS.alert),
        init.price
          ? "We couldn't read this price confidently. Check it — it's what a “no” will be worth."
          : 'No price found. Add it — it’s what a “no” will be worth.',
      ),
    );
  }
  if (init.soldOut) {
    body.append(h('div', { class: 'iv-flag', role: 'note' }, svg(ICONS.alert), 'Looks sold out right now. You can still vault it.'));
  }

  // ── Why ──────────────────────────────────────────────────────────────────
  const noteInput = h('input', {
    class: 'iv-input',
    type: 'text',
    maxLength: 280,
    placeholder: 'One line. Future you will read this.',
    id: 'iv-note',
    autocomplete: 'off',
  });
  body.append(h('div', { class: 'iv-field' }, h('label', { class: 'iv-label', htmlFor: 'iv-note' }, 'Why do you want this?'), noteInput));

  // ── Cooldown ─────────────────────────────────────────────────────────────
  const seg = h('div', { class: 'iv-seg', role: 'radiogroup', 'aria-label': 'Cooling-off period' });
  const presets = Object.entries(COOLDOWN_PRESETS) as [string, number][];
  if (!presets.some(([, hrs]) => hrs === cooldown)) presets.push([`${cooldown}h`, cooldown]);
  const segButtons = presets.map(([label, hours]) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(hours === cooldown), tabIndex: hours === cooldown ? 0 : -1 }, label);
    b.addEventListener('click', () => select(hours));
    return { b, hours };
  });
  const select = (hours: number) => {
    cooldown = hours;
    for (const s of segButtons) {
      s.b.setAttribute('aria-checked', String(s.hours === hours));
      s.b.tabIndex = s.hours === hours ? 0 : -1;
    }
  };
  seg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = segButtons.findIndex((s) => s.hours === cooldown);
    const next = segButtons[(i + (e.key === 'ArrowRight' ? 1 : segButtons.length - 1)) % segButtons.length]!;
    select(next.hours);
    next.b.focus();
  });
  seg.append(...segButtons.map((s) => s.b));
  body.append(h('div', { class: 'iv-row' }, h('span', { class: 'iv-label' }, 'Cool off for'), seg));

  // ── Options ──────────────────────────────────────────────────────────────
  const lockdown = h('input', { type: 'checkbox' });
  body.append(
    h('label', { class: 'iv-check' }, lockdown,
      h('span', null, h('strong', null, 'Lockdown'), ' — no “view anyway”. Revisiting the page takes the same effort as unlocking early.'),
    ),
  );
  let siteAccess: HTMLInputElement | null = null;
  if (init.siteAccess) {
    siteAccess = h('input', { type: 'checkbox', checked: true });
    body.append(
      h('label', { class: 'iv-check' }, siteAccess,
        h('span', null, h('strong', null, `Lock ${init.siteAccess.domain} too`), ' — Chrome will ask to let Impulse Vault see that site. Without it, the item is tracked but not locked.'),
      ),
    );
  }

  const error = h('div', { class: 'iv-error', role: 'alert', hidden: true });
  body.append(error);

  // ── Actions ──────────────────────────────────────────────────────────────
  const submitBtn = h('button', { class: 'iv-btn iv-btn-primary', type: 'button' }, svg(ICONS.lock), 'Lock it');
  const cancelBtn = h('button', { class: 'iv-btn iv-btn-ghost', type: 'button' }, 'Cancel');
  body.append(h('div', { class: 'iv-actions' }, cancelBtn, submitBtn));
  card.append(body);

  const showError = (msg: string) => {
    error.textContent = msg;
    error.hidden = false;
  };

  cancelBtn.addEventListener('click', () => handlers.cancel());
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handlers.cancel();
    }
  });
  noteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitBtn.click();
    }
  });
  priceInput.addEventListener('input', () => priceInput.removeAttribute('aria-invalid'));

  submitBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    const price = parseMoneyInput(priceInput.value, currency);
    if (!title) {
      showError('Give it a name.');
      titleInput.focus();
      return;
    }
    if (!price) {
      priceInput.setAttribute('aria-invalid', 'true');
      showError('Add the price — it’s what a “no” will be worth.');
      priceInput.focus();
      return;
    }
    error.hidden = true;
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    const draft: VaultDraft = {
      url: init.url,
      title,
      imageUrl: init.imageUrl,
      price,
      note: noteInput.value.trim() || undefined,
      cooldownHours: cooldown,
      lockdown: lockdown.checked,
      confidence: init.confidence,
      productId: init.productId,
      packId: init.packId,
    };
    // No await before this call: submit() may need the click's user gesture (permissions.request).
    handlers
      .submit(draft, { wantsSiteAccess: !!siteAccess?.checked })
      .then(async (result) => {
        if (result.status === 'duplicate') {
          showDuplicate(card, body, result, handlers);
          return;
        }
        await playVaultDrop(card, body, cooldownWords(cooldown), init.sound);
        handlers.done?.(result);
      })
      .catch((err: unknown) => {
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        showError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      });
  });

  // Focus: low confidence → the price, so it gets corrected; otherwise the "why".
  queueMicrotask(() => {
    autosize();
    if (init.confidence === 'low' || !init.price) {
      priceInput.focus();
      priceInput.select();
    } else {
      noteInput.focus();
    }
  });
  return card;
}

function showDuplicate(card: HTMLElement, body: HTMLElement, result: CreateResult, handlers: VaultCardHandlers): void {
  const { item } = result;
  const now = Date.now();
  const line =
    item.state === 'cooling'
      ? `You vaulted this ${describeWhen(item.vaultedAt, now)}. ${capitalise(formatRemaining(remainingMs(item.unlockAt, now)))} to go.`
      : 'Its timer already ran out — it’s waiting for your verdict in the popup.';
  const ok = h('button', { class: 'iv-btn iv-btn-primary', type: 'button' }, 'Got it');
  ok.addEventListener('click', () => handlers.done?.(result));
  body.replaceChildren(
    h('div', { class: 'iv-dup' }, h('div', { class: 'iv-dup-title' }, 'Already in the vault.'), h('p', null, line), ok),
  );
  card.focus();
  ok.focus();
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The drop. Door pops in → card lifts and falls into the door on a spring → wheel spins shut
 * with a thunk → "Locked." Resolves when the sequence has finished.
 */
export async function playVaultDrop(card: HTMLElement, body: HTMLElement, backIn: string, sound: boolean): Promise<void> {
  const reduced = prefersReducedMotion();
  const cardRect = card.getBoundingClientRect();
  card.style.height = `${cardRect.height}px`;

  const door = h('div', { class: 'iv-door' });
  door.innerHTML = VAULT_DOOR;
  const msg = h('div', { class: 'iv-stage-msg' }, 'Locked.');
  const sub = h('div', { class: 'iv-stage-sub' }, `Back in ${backIn}.`);
  const stage = h('div', { class: 'iv-stage', 'aria-live': 'polite' }, door, msg, sub);
  card.append(stage);

  if (reduced) {
    body.style.visibility = 'hidden';
    msg.style.opacity = '1';
    sub.style.opacity = '1';
    if (sound) playLockSound();
    await wait(900);
    return;
  }

  // Where the card's centre has to travel to reach the door's centre.
  const doorRect = door.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const dx = doorRect.left + doorRect.width / 2 - (bodyRect.left + bodyRect.width / 2);
  const dy = doorRect.top + doorRect.height / 2 - (bodyRect.top + bodyRect.height / 2);

  const doorIn = door.animate(
    [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: SPRINGS.pop.duration, easing: SPRINGS.pop.easing, fill: 'both' },
  );

  // Anticipation: a small lift, like picking the card up.
  await body.animate(
    [{ transform: 'none' }, { transform: 'translateY(-6px) scale(1.015)' }],
    { duration: 110, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' },
  ).finished;

  const drop = body.animate(
    [
      { transform: 'translateY(-6px) scale(1.015)', opacity: 1, filter: 'blur(0)' },
      { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(-6deg)`, opacity: 0.9, filter: 'blur(0)', offset: 0.82 },
      { transform: `translate(${dx}px, ${dy}px) scale(.02) rotate(-8deg)`, opacity: 0, filter: 'blur(1px)' },
    ],
    { duration: 400, easing: SPRINGS.drop.easing, fill: 'forwards' },
  );
  await Promise.all([drop.finished, doorIn.finished]);
  // The vault closes around it: the card contracts to just the door and the words.
  card.style.height = `${Math.min(cardRect.height, 212)}px`;

  // The thunk: wheel spins shut, door settles.
  if (sound) playLockSound();
  const wheel = door.querySelector('.iv-wheel') as SVGGElement | null;
  wheel?.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-120deg)' }], {
    duration: SPRINGS.wheel.duration,
    easing: SPRINGS.wheel.easing,
    fill: 'forwards',
  });
  door.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(.93)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' },
  );
  await wait(140);
  const textIn = [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }];
  msg.animate(textIn, { duration: SPRINGS.soft.duration, easing: SPRINGS.soft.easing, fill: 'forwards' });
  sub.animate(textIn, { duration: SPRINGS.soft.duration, delay: 70, easing: SPRINGS.soft.easing, fill: 'forwards' });
  await wait(1100);
}
