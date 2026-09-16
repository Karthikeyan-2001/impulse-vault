import { useState } from 'react';
import { call } from '../lib/api';
import { formatMoney } from '../lib/money';
import { isRemovable, sortCooling } from '../lib/state';
import { formatCountdown, formatRemaining, remainingMs } from '../lib/time';
import type { VaultItem } from '../types';
import { useNow } from '../ui/react/hooks';
import { DoorArt, Empty, Kbd, LockGlyph, Thumb } from './components';

type LetGo = (item: VaultItem, from: DOMRect) => Promise<void>;

export function CoolingTab({
  items,
  onLetGo,
  onUnlockEarly,
}: {
  items: VaultItem[];
  onLetGo: LetGo;
  onUnlockEarly: (item: VaultItem) => void;
}) {
  const now = useNow(1000);
  const list = sortCooling(items);
  if (!list.length) {
    return (
      <Empty art={<DoorArt />} title="Nothing cooling.">
        Next time something grabs you, hit <Kbd><LockGlyph className="h-3 w-3" /> Vault it</Kbd> next to Add to Cart — or
        open this popup on any product page. 72 hours later, you decide.
      </Empty>
    );
  }
  return (
    <ul className="m-0 list-none p-0">
      {list.map((item) => (
        <CoolingRow key={item.id} item={item} now={now} onLetGo={onLetGo} onUnlockEarly={onUnlockEarly} />
      ))}
    </ul>
  );
}

function CoolingRow({
  item,
  now,
  onLetGo,
  onUnlockEarly,
}: {
  item: VaultItem;
  now: number;
  onLetGo: LetGo;
  onUnlockEarly: (item: VaultItem) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = remainingMs(item.unlockAt, now);
  const progress = 1 - left / (item.unlockAt - item.vaultedAt);
  const undo = isRemovable(item, now);
  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex gap-3">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-[13px] font-semibold leading-snug text-text no-underline hover:underline"
            title={item.title}
          >
            {item.title}
          </a>
          <div className="mt-1 flex items-center gap-2 text-[12.5px]">
            <span className="font-semibold tabular">{formatMoney(item.priceAtVault)}</span>
            <span className="text-muted">·</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-brass-soft px-1.5 py-0.5 font-semibold text-brass-strong tabular" aria-label={`${formatRemaining(left)} to go`}>
              <LockGlyph className="h-3 w-3" />
              {formatCountdown(left)}
            </span>
            {!item.lockEnabled ? <span className="text-[11.5px] text-muted" title="No access to this site, so it's tracked but not locked.">tracked only</span> : null}
          </div>
          {item.note ? <p className="m-0 mt-1.5 line-clamp-2 text-[12.5px] italic text-muted">“{item.note}”</p> : null}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-brass transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px]">
            <button
              disabled={busy}
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-mint hover:underline disabled:opacity-50"
              title={`Decide now that you don't want it: ${formatMoney(item.priceAtVault)} goes to your stack.`}
              onClick={(e) => {
                setBusy(true);
                onLetGo(item, e.currentTarget.getBoundingClientRect()).catch((err: Error) => {
                  setBusy(false);
                  setError(err.message);
                });
              }}
            >
              Let it go
            </button>
            <button className="cursor-pointer border-0 bg-transparent p-0 text-muted hover:text-text hover:underline" onClick={() => onUnlockEarly(item)}>
              Unlock early
            </button>
            {undo ? (
              <button
                className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-muted hover:text-text hover:underline"
                onClick={() => call('vault/remove', { id: item.id }).catch((e: Error) => setError(e.message))}
              >
                Vaulted by mistake? Remove
              </button>
            ) : null}
          </div>
          {error ? <p className="m-0 mt-1 text-[12px] text-danger">{error}</p> : null}
        </div>
      </div>
    </li>
  );
}
