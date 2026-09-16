import { useState } from 'react';
import { itemDelta, latestPrice, releaseCopy } from '../lib/copy';
import { formatMoney } from '../lib/money';
import { payoutAmount, sortRipe } from '../lib/state';
import { describeWhen } from '../lib/time';
import type { VaultItem } from '../types';
import { Empty, Thumb } from './components';

export function RipeTab({
  items,
  onDecline,
  onRelease,
}: {
  items: VaultItem[];
  onDecline: (item: VaultItem, from: DOMRect) => Promise<void>;
  onRelease: (item: VaultItem) => Promise<void>;
}) {
  const list = sortRipe(items);
  if (!list.length) {
    return (
      <Empty art={<HourglassArt />} title="Nothing to decide yet.">
        When a timer runs out, the item lands here and you get the verdict: buy it, or keep the money. No rush — it waits two
        weeks for you.
      </Empty>
    );
  }
  return (
    <ul className="m-0 list-none p-0">
      {list.map((item) => (
        <RipeRow key={item.id} item={item} onDecline={onDecline} onRelease={onRelease} />
      ))}
    </ul>
  );
}

function RipeRow({
  item,
  onDecline,
  onRelease,
}: {
  item: VaultItem;
  onDecline: (item: VaultItem, from: DOMRect) => Promise<void>;
  onRelease: (item: VaultItem) => Promise<void>;
}) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [released, setReleased] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const delta = itemDelta(item);
  const payout = formatMoney(payoutAmount(item));
  const soldOut = item.soldOut === true;

  if (released) {
    return (
      <li className="border-b border-line px-4 py-5 text-center last:border-b-0">
        <p className="m-0 text-[15px] font-semibold">{releaseCopy(item)}</p>
        <p className="m-0 mt-1 text-[12.5px] text-muted">Opening it for you…</p>
      </li>
    );
  }

  const run = (which: 'yes' | 'no', fn: () => Promise<void>) => {
    setBusy(which);
    setError(null);
    fn().catch((e: Error) => {
      setBusy(null);
      setError(e.message);
    });
  };

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex gap-3">
        <Thumb item={item} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-brass-strong">Do you still want this?</div>
          <div className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-snug" title={item.title}>
            {item.title}
          </div>
          <div className="mt-1 text-[12.5px] text-muted">
            <span className="font-semibold text-text tabular">{formatMoney(latestPrice(item))}</span> · wanted {describeWhen(item.vaultedAt, Date.now())}
          </div>
        </div>
      </div>
      {item.note ? (
        <blockquote className="m-0 mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[13px] leading-snug">
          “{item.note}”<span className="mt-0.5 block text-[11px] text-muted">— you, {describeWhen(item.vaultedAt, Date.now())}</span>
        </blockquote>
      ) : null}
      {soldOut ? (
        <p className="m-0 mt-2 text-[12.5px] font-semibold text-warn">This sold out while you waited. Letting it go still counts — the money wasn’t spent.</p>
      ) : delta && delta.kind !== 'same' ? (
        <p className={`m-0 mt-2 text-[12.5px] ${delta.kind === 'drop' ? 'font-semibold text-mint' : 'text-muted'}`}>{delta.text}</p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {soldOut ? (
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-[10px] border border-line text-[13px] font-semibold text-text no-underline hover:bg-surface-2">
            Check the page
          </a>
        ) : (
          <button
            disabled={!!busy}
            onClick={() =>
              run('yes', async () => {
                await onRelease(item);
                setReleased(true);
              })
            }
            className="h-10 cursor-pointer rounded-[10px] border border-line bg-surface text-[13px] font-semibold text-text transition hover:bg-surface-2 disabled:opacity-50"
          >
            Yes, buy it
          </button>
        )}
        <button
          disabled={!!busy}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            run('no', () => onDecline(item, rect));
          }}
          className="h-10 cursor-pointer rounded-[10px] border-0 bg-mint text-[13px] font-semibold text-on-mint transition hover:opacity-90 disabled:opacity-50"
        >
          No, save {payout}
        </button>
      </div>
      {error ? <p className="m-0 mt-2 text-[12px] text-danger">{error}</p> : null}
    </li>
  );
}

function HourglassArt() {
  return (
    <svg viewBox="0 0 48 48" width={52} height={52} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 6h20M14 42h20M16 6c0 10 16 12 16 18s-16 8-16 18M32 6c0 10-16 12-16 18s16 8 16 18" />
      <path d="M19 38c2-3 8-3 10 0" fill="currentColor" stroke="none" opacity=".5" />
    </svg>
  );
}
