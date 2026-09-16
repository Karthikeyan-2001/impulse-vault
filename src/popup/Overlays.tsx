import { useEffect, useRef } from 'react';
import { call } from '../lib/api';
import { formatMoney } from '../lib/money';
import { prefersReducedMotion } from '../lib/spring';
import type { Settings, VaultItem } from '../types';
import { Mount } from '../ui/react/Mount';
import { createUnlockFlow } from '../ui/unlock';

export function UnlockPanel({ item, settings, onClose }: { item: VaultItem; settings: Settings; onClose: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
      <button onClick={onClose} className="mb-2 cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-muted hover:text-text">
        ← Back
      </button>
      <Mount
        create={() => {
          const flow = createUnlockFlow({
            item,
            minChars: settings.unlockMinChars,
            waitSeconds: settings.unlockWaitSeconds,
            compact: true,
            onWait: onClose,
            onUnlock: async (reason) => {
              await call('vault/unlockEarly', { id: item.id, reason });
              setTimeout(onClose, 1800);
            },
          });
          return flow;
        }}
      />
    </div>
  );
}

/** One-time milestone celebration: a short coin shower behind the number. */
export function Celebration({
  amountMinor,
  currency,
  equivalence,
  onDone,
}: {
  amountMinor: number;
  currency: string;
  equivalence?: string;
  onDone: () => void;
}) {
  const rainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rain = rainRef.current;
    if (!rain || prefersReducedMotion()) return;
    const coins: Animation[] = [];
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('div');
      c.className = 'absolute top-0 h-3 w-5 rounded-[50%] bg-brass shadow-[inset_0_-2px_0_var(--iv-brass-strong)]';
      c.style.left = `${5 + ((i * 37) % 90)}%`;
      rain.appendChild(c);
      coins.push(
        c.animate(
          [
            { transform: 'translateY(-30px) rotate(0deg)', opacity: 0 },
            { opacity: 1, offset: 0.1 },
            { transform: `translateY(${520 + (i % 4) * 20}px) rotate(${(i % 2 ? 1 : -1) * 540}deg)`, opacity: 0.9 },
          ],
          { duration: 1400 + (i % 5) * 180, delay: i * 70, easing: 'cubic-bezier(.35,0,.8,.6)', fill: 'forwards' },
        ),
      );
    }
    return () => {
      coins.forEach((a) => a.cancel());
      rain.replaceChildren();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg/95 px-8 text-center" role="dialog" aria-label="Milestone reached">
      <div ref={rainRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      <div className="relative">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Milestone</div>
        <div className="mt-2 text-[44px] font-[750] leading-none tracking-[-0.02em] text-mint tabular">{formatMoney({ amountMinor, currency })}</div>
        <p className="m-0 mt-3 text-[15px] font-semibold">kept. All of it stayed yours.</p>
        {equivalence ? <p className="m-0 mt-1 text-[13px] text-muted">That’s {equivalence}.</p> : null}
        <button autoFocus onClick={onDone} className="mt-6 h-10 cursor-pointer rounded-[10px] border-0 bg-ink px-5 text-[13px] font-semibold text-on-ink hover:opacity-90">
          Keep going
        </button>
      </div>
    </div>
  );
}

export function celebrationFor(meta: { pendingCelebration?: { currency: string; amountMinor: number } }, settings: Settings) {
  const p = meta.pendingCelebration;
  if (!p) return null;
  return { ...p, equivalence: settings.milestones.find((m) => m.amountMinor === p.amountMinor)?.equivalence };
}
