/**
 * The most valuable screen in the app: "why I wanted this" next to "and I didn't buy it".
 */
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/time';
import type { Settings, Stacks, VaultItem } from '../types';
import { CoinStack } from './Stack';
import { Empty } from './components';

export function SavedTab({ items, stacks, settings }: { items: VaultItem[]; stacks: Stacks; settings: Settings }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const history = Object.values(stacks)
    .flatMap((s) => s.history.map((h) => ({ ...h, currency: s.currency })))
    .sort((a, b) => b.at - a.at);
  const bought = items.filter((i) => i.state === 'released' && !i.earlyUnlock).length;
  const early = items.filter((i) => i.earlyUnlock).length;

  if (!history.length) {
    return (
      <Empty art={<CoinStack count={3} />} title="Your stack starts with one “no”.">
        When a timer runs out and you decide you don’t want it after all, its price lands here — and stays. Buying things later
        never takes anything away.
      </Empty>
    );
  }

  const currency = settings.displayCurrency;
  const total = stacks[currency]?.totalMinor ?? 0;
  return (
    <div>
      <section className="px-4 pb-2 pt-3">
        <h2 className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Milestones</h2>
        <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
          {[...settings.milestones]
            .sort((a, b) => a.amountMinor - b.amountMinor)
            .map((m) => {
              const hit = total >= m.amountMinor;
              return (
                <li key={m.amountMinor} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${hit ? 'bg-mint text-white' : 'border border-line text-transparent'}`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className={`tabular ${hit ? 'font-semibold' : 'text-muted'}`}>{formatMoney({ amountMinor: m.amountMinor, currency })}</span>
                  {m.equivalence ? <span className="truncate text-muted">· {m.equivalence}</span> : null}
                </li>
              );
            })}
        </ul>
      </section>

      <section className="mx-4 mt-2 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <div className="text-[18px] font-bold tabular">{bought}</div>
          <div className="text-muted">bought after waiting — the system working</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <div className="text-[18px] font-bold tabular">{early}</div>
          <div className="text-muted">early unlocks. That door’s there on purpose.</div>
        </div>
      </section>

      <h2 className="m-0 px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Things you didn’t buy</h2>
      <ul className="m-0 list-none p-0">
        {history.map((h) => {
          const item = byId.get(h.itemId);
          return (
            <li key={h.itemId} className="border-b border-line px-4 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="line-clamp-1 text-[13px] font-semibold">{item?.title ?? 'An item'}</span>
                <span className="shrink-0 text-[13px] font-bold text-mint tabular">+{formatMoney({ amountMinor: h.amountMinor, currency: h.currency })}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">{formatDate(h.at)}</div>
              {item?.note ? (
                <p className="m-0 mt-1.5 text-[12.5px] leading-snug">
                  <span className="italic">“{item.note}”</span>
                  <span className="text-muted"> — {h.auto ? 'and then you forgot about it.' : 'and you didn’t buy it.'}</span>
                </p>
              ) : (
                <p className="m-0 mt-1 text-[12px] text-muted">{h.auto ? `Left unanswered for ${settings.expiryDays} days. Counted, softly.` : 'You didn’t buy it.'}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 px-4 pb-4 pt-2 text-center text-[11.5px] text-muted">The stack never goes down. Buying something later doesn’t take anything back.</p>
    </div>
  );
}
