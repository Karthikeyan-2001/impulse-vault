/**
 * "Vault this page" from the toolbar: works on any site via activeTab, including ones without
 * a site pack. On a site we can't lock yet, the card offers to ask for access.
 */
import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import { formatMoney } from '../lib/money';
import { presetLabel } from '../lib/time';
import { domainOf } from '../lib/url';
import type { TabExtraction } from '../types/messages';
import { Mount } from '../ui/react/Mount';
import { createVaultCard } from '../ui/vault-card';
import { LockGlyph } from './components';

export function useTabExtraction(): TabExtraction | null | 'loading' {
  const [tab, setTab] = useState<TabExtraction | null | 'loading'>('loading');
  useEffect(() => {
    call('page/extractTab', {}).then(setTab, () => setTab(null));
  }, []);
  return tab;
}

export function VaultThisPageButton({ tab, onStart }: { tab: TabExtraction; onStart: () => void }) {
  const ex = tab.extraction;
  if (!ex || !tab.url) return null;
  const label = `Vault it — ${presetLabel(tab.defaultCooldownHours)}`;
  if (!ex.isProductPage && !ex.price) {
    return (
      <div className="px-4 pb-1 pt-3 text-[12.5px] text-muted">
        Not a product page?{' '}
        <button className="cursor-pointer border-0 bg-transparent p-0 text-muted underline underline-offset-2 hover:text-text" onClick={onStart}>
          Vault it anyway
        </button>
      </div>
    );
  }
  return (
    <div className="px-4 pt-3">
      <button
        onClick={onStart}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left transition hover:border-brass focus-visible:outline-2 focus-visible:outline-brass"
      >
        {ex.imageUrl ? (
          <img src={ex.imageUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg border border-line bg-surface-2 object-contain" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{ex.title ?? domainOf(tab.url)}</span>
          <span className="block text-[12px] text-muted">{ex.price ? formatMoney(ex.price) : 'Price not found — you can add it'}</span>
        </span>
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-semibold text-on-ink transition group-hover:opacity-90">
          <LockGlyph /> {label}
        </span>
      </button>
    </div>
  );
}

export function VaultFlow({ tab, onDone }: { tab: TabExtraction; onDone: (created: boolean) => void }) {
  const ex = tab.extraction!;
  const url = tab.url!;
  return (
    <div className="px-4 py-3">
      <Mount
        create={() =>
          createVaultCard(
            {
              url,
              title: ex.title,
              imageUrl: ex.imageUrl,
              price: ex.price,
              currencyHint: ex.price?.currency ?? tab.displayCurrency,
              confidence: ex.confidence,
              productId: ex.productId,
              packId: ex.packId,
              soldOut: ex.inStock === false,
              defaultCooldownHours: tab.defaultCooldownHours,
              siteAccess: tab.hasAccess ? null : { domain: domainOf(url) },
              variant: 'popup',
              sound: tab.lockSound,
            },
            {
              submit: (draft, { wantsSiteAccess }) => {
                // Ask for access inside the click; the worker upgrades the item when it's granted,
                // even if Chrome's prompt closes this popup first.
                if (wantsSiteAccess && tab.origin) {
                  chrome.permissions.request({ origins: [tab.origin] }).catch(() => false);
                }
                return call('vault/create', { draft });
              },
              cancel: () => onDone(false),
              done: (r) => onDone(r.status === 'created'),
            },
          )
        }
      />
    </div>
  );
}
