import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { call } from '../lib/api';
import { declineCopy } from '../lib/copy';
import { payoutAmount } from '../lib/state';
import type { VaultItem } from '../types';
import { useVaultState } from '../ui/react/hooks';
import { CoolingTab } from './CoolingTab';
import { Celebration, UnlockPanel, celebrationFor } from './Overlays';
import { RipeTab } from './RipeTab';
import { SavedTab } from './SavedTab';
import { StackHeader, type Payout } from './Stack';
import { VaultFlow, VaultThisPageButton, useTabExtraction } from './VaultThisPage';

type TabId = 'cooling' | 'ripe' | 'saved';
const TABS: { id: TabId; label: string }[] = [
  { id: 'cooling', label: 'Cooling' },
  { id: 'ripe', label: 'Ripe' },
  { id: 'saved', label: 'Saved' },
];

export function App() {
  const state = useVaultState();
  const tab = useTabExtraction();
  const [vaulting, setVaulting] = useState(false);
  const [active, setActive] = useState<TabId | null>(() => (location.hash === '#ripe' ? 'ripe' : null));
  const [unlocking, setUnlocking] = useState<VaultItem | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  // A milestone must never cut the payout off: the coin lands and the total counts up first.
  const [payoutSettling, setPayoutSettling] = useState(false);
  const payoutKey = useRef(0);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ cooling: null, ripe: null, saved: null });

  const items = state ? Object.values(state.items) : [];
  const coolingCount = items.filter((i) => i.state === 'cooling').length;
  const ripeCount = items.filter((i) => i.state === 'ripe').length;
  // Default tab: the verdicts if any are waiting, else what's cooling.
  const current: TabId = active ?? (ripeCount ? 'ripe' : 'cooling');

  useEffect(() => {
    if (state && location.hash === '#ripe' && !ripeCount) setActive(null);
  }, [state, ripeCount]);

  if (!state) return <div className="h-[460px] w-[380px] bg-bg" />;
  const { settings } = state;

  const decline = async (item: VaultItem, from: DOMRect) => {
    const res = await call('vault/decline', { id: item.id });
    const amount = payoutAmount(res.item);
    setPayout({
      key: ++payoutKey.current,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      toTotal: res.totalMinor,
      toCoins: res.declineCount,
      from,
      copy: declineCopy(amount),
    });
    setPayoutSettling(true);
    setTimeout(() => setPayoutSettling(false), 2600);
  };

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === current);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setActive(TABS[next]!.id);
    tabRefs.current[TABS[next]!.id]?.focus();
  };

  const celebration = payoutSettling ? null : celebrationFor(state.meta, settings);
  const counts: Record<TabId, number | null> = { cooling: coolingCount, ripe: ripeCount, saved: null };

  return (
    <div className="flex max-h-[600px] min-h-[460px] w-[380px] flex-col bg-bg">
      <div className="relative">
        <StackHeader stacks={state.stacks} settings={settings} payout={payout} onOpenSaved={() => setActive('saved')} />
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="absolute right-3 top-3 grid h-8 w-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Settings"
          title="Settings"
        >
          <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      {vaulting && tab && tab !== 'loading' ? (
        <VaultFlow
          tab={tab}
          onDone={(created) => {
            setVaulting(false);
            if (created) setActive('cooling');
          }}
        />
      ) : unlocking ? (
        <UnlockPanel item={unlocking} settings={settings} onClose={() => setUnlocking(null)} />
      ) : (
        <>
          {tab && tab !== 'loading' ? <VaultThisPageButton tab={tab} onStart={() => setVaulting(true)} /> : null}
          <nav role="tablist" aria-label="Vault" className="mt-3 flex gap-1 border-b border-line px-3" onKeyDown={onTabKey}>
            {TABS.map((t) => {
              const selected = t.id === current;
              const count = counts[t.id];
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(t.id)}
                  className={`relative -mb-px inline-flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-2.5 pb-2 pt-1 text-[13px] font-semibold transition-colors ${
                    selected ? 'border-ink text-text' : 'border-transparent text-muted hover:text-text'
                  }`}
                >
                  {t.label}
                  {count ? (
                    <span
                      className={`rounded-full px-1.5 text-[11px] leading-[18px] tabular ${
                        t.id === 'ripe' ? 'bg-brass text-[#1d1b22]' : 'bg-surface-2 text-muted'
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <main id={`panel-${current}`} role="tabpanel" aria-labelledby={`tab-${current}`} className="min-h-0 flex-1 overflow-y-auto">
            {current === 'cooling' ? (
              <CoolingTab
                items={items}
                onLetGo={(item, from) => decline(item, from)}
                onUnlockEarly={(item) => setUnlocking(item)}
              />
            ) : current === 'ripe' ? (
              <RipeTab
                items={items}
                onDecline={decline}
                onRelease={async (item) => {
                  const released = await call('vault/release', { id: item.id });
                  setTimeout(() => void chrome.tabs.create({ url: released.url }), 1100);
                }}
              />
            ) : (
              <SavedTab items={items} stacks={state.stacks} settings={settings} />
            )}
          </main>
        </>
      )}

      {celebration ? (
        <Celebration {...celebration} onDone={() => void call('meta/ackCelebration', {})} />
      ) : null}
    </div>
  );
}
