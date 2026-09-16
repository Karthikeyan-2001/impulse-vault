/**
 * Layer 2: the cart/checkout block. This is the layer that actually stops purchases, so it
 * carries the friction, and the product-page bypass doesn't apply here.
 *
 * It blocks the *cart*, not the item, so it also offers an honest "something else in my
 * cart?" pass (with its own, smaller, friction). Blocking all of Amazon for three days over
 * one pair of headphones would get the extension uninstalled — see DECISIONS.md.
 */
import { call } from '../../lib/api';
import { latestPrice } from '../../lib/copy';
import { formatMoney } from '../../lib/money';
import { cartRegex, lockedItems, matches } from '../../lib/rules';
import { repo } from '../../lib/storage';
import { formatRemaining, remainingMs } from '../../lib/time';
import type { Settings, VaultItem } from '../../types';
import { h } from '../../ui/dom';
import { createUnlockFlow } from '../../ui/unlock';
import { backDestination, bootPage, brand, currentTabId, goTo, originalUrl } from '../shared';

const root = bootPage();
const domain = new URLSearchParams(location.search).get('d') ?? '';
const original = originalUrl();
const PASS_WAIT_SECONDS = 10;

async function main(): Promise<void> {
  const [all, settings, tabId] = await Promise.all([repo.getItemList(), repo.getSettings(), currentTabId()]);
  const items = lockedItems(all).filter((i) => i.domain === domain);
  if (!items.length) {
    // Nothing cooling here any more (stale rule): the worker drops it and we carry on.
    await call('cart/pass', { domain, url: original, tabId }).catch(() => goTo(original));
    return;
  }
  render(items, settings, tabId);
}

function leave(): Promise<void> {
  return goTo(backDestination(original, (u) => matches(cartRegex(domain), u)));
}

function render(items: VaultItem[], settings: Settings, tabId: number): void {
  const card = h('section', { class: 'iv-page-card' }, brand());
  const afterUnlock = async () => {
    const still = lockedItems(await repo.getItemList()).filter((i) => i.domain === domain);
    if (still.length) setTimeout(() => render(still, settings, tabId), 1400);
    else setTimeout(() => void goTo(original), 1400);
  };

  if (items.length === 1) {
    const item = items[0]!;
    card.append(
      h('h1', { class: 'iv-h1' }, 'Checkout’s locked while this cools off.'),
      h('p', { class: 'iv-sub' }, `It’s in your vault. The cart on ${domain} opens again when the timer’s done.`),
      createUnlockFlow({
        item,
        minChars: settings.unlockMinChars,
        waitSeconds: settings.unlockWaitSeconds,
        onWait: () => void leave(),
        onUnlock: async (reason) => {
          await call('vault/unlockEarly', { id: item.id, reason });
          await afterUnlock();
        },
        unlockedCopy: 'Unlocked. Taking you to your cart.',
      }),
    );
  } else {
    const wait = h('button', { class: 'iv-btn iv-btn-primary iv-btn-lg', type: 'button', style: 'width:100%' }, 'I’ll wait');
    wait.addEventListener('click', () => void leave());
    const list = h('div', { class: 'iv-stack' });
    for (const item of items.sort((a, b) => a.unlockAt - b.unlockAt)) {
      const slot = h('div');
      const unlock = h('button', { class: 'iv-link', type: 'button' }, 'Unlock early');
      unlock.addEventListener('click', () => {
        unlock.remove();
        slot.replaceChildren(
          createUnlockFlow({
            item,
            compact: true,
            minChars: settings.unlockMinChars,
            waitSeconds: settings.unlockWaitSeconds,
            waitLabel: 'Never mind',
            onWait: () => render(items, settings, tabId),
            onUnlock: async (reason) => {
              await call('vault/unlockEarly', { id: item.id, reason });
              await afterUnlock();
            },
          }),
        );
      });
      list.append(
        h('div', { class: 'iv-mini' },
          item.imageUrl ? h('img', { src: item.imageUrl, alt: '', referrerpolicy: 'no-referrer' }) : null,
          h('div', { style: 'flex:1; min-width:0' },
            h('div', { class: 'iv-mini-title' }, item.title),
            h('div', { class: 'iv-mini-meta iv-num' }, `${formatMoney(latestPrice(item))} · ${formatRemaining(remainingMs(item.unlockAt, Date.now()))} to go`),
            item.note ? h('div', { class: 'iv-mini-meta', style: 'font-style: italic' }, `“${item.note}”`) : null,
          ),
          unlock,
        ),
        slot,
      );
    }
    card.append(
      h('h1', { class: 'iv-h1' }, `Checkout’s locked while ${items.length} things cool off.`),
      h('p', { class: 'iv-sub' }, `They’re in your vault. The cart on ${domain} opens again when their timers are done.`),
      list,
      h('hr', { class: 'iv-hr' }),
      wait,
    );
  }

  card.append(h('hr', { class: 'iv-hr' }), cartPass(items, tabId));
  root.replaceChildren(card, h('p', { class: 'iv-foot' }, 'Buying after the wait is a win, not a failure. The lock is only here for the in-between.'));
}

/** "Buying something else?" — an honest pass with a smaller speed bump. */
function cartPass(items: VaultItem[], tabId: number): HTMLElement {
  const wrap = h('div');
  const open = h('button', { class: 'iv-link', type: 'button' }, `Buying something else from ${domain}?`);
  wrap.append(h('div', { style: 'text-align:center' }, open));
  open.addEventListener('click', () => {
    const names = items.map((i) => i.title.length > 48 ? `${i.title.slice(0, 48)}…` : i.title).join(', ');
    const check = h('input', { type: 'checkbox' });
    const go = h('button', { class: 'iv-btn iv-btn-ghost', type: 'button', disabled: true }, `Continue in ${PASS_WAIT_SECONDS}s`);
    let left = PASS_WAIT_SECONDS;
    let timer: number | null = null;
    check.addEventListener('change', () => {
      if (!check.checked) {
        if (timer !== null) clearInterval(timer);
        timer = null;
        left = PASS_WAIT_SECONDS;
        go.disabled = true;
        go.textContent = `Continue in ${left}s`;
        return;
      }
      timer = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearInterval(timer!);
          go.disabled = false;
          go.textContent = 'Continue to my cart';
        } else go.textContent = `Continue in ${left}s`;
      }, 1000);
    });
    go.addEventListener('click', () => {
      go.disabled = true;
      void call('cart/pass', { domain, url: original, tabId });
    });
    wrap.replaceChildren(
      h('div', { class: 'iv-pass' },
        h('p', null, `Your cart can hold other things. This opens checkout on ${domain} in this tab for 10 minutes.`),
        h('label', null, check, h('span', null, `My cart doesn’t include ${names}.`)),
        go,
      ),
    );
  });
  return wrap;
}

void main();
