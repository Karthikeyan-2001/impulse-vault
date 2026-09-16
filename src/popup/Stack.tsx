/**
 * The Saved Money Stack. One metaphor, committed to: coins. Every "no" is a coin on the stack.
 * A payout flies a coin from the item into the header, lands it on the stack with a spring,
 * and only then does the total count up. The number never goes down.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { formatMoney } from '../lib/money';
import { SPRINGS, prefersReducedMotion } from '../lib/spring';
import { nextMilestone } from '../lib/state';
import type { Settings, Stacks } from '../types';
import { playCoinSound } from '../ui/sound';

export interface Payout {
  key: number;
  amountMinor: number;
  currency: string;
  /** Stack after the payout, straight from the worker (storage may not have reached us yet). */
  toTotal: number;
  toCoins: number;
  /** Where the coin starts (the button that was clicked). */
  from: DOMRect;
  copy: string;
}

const COIN_W = 34;
const COIN_H = 7;
const PER_COLUMN = 12;
const COLUMNS = 3;
const MAX_COINS = PER_COLUMN * COLUMNS;

function coinPosition(i: number): { x: number; y: number } {
  const col = Math.floor(i / PER_COLUMN) % COLUMNS;
  const row = i % PER_COLUMN;
  // Slight, deterministic wobble so the stack looks piled, not printed.
  const wobble = ((i * 7919) % 5) - 2;
  return { x: col * (COIN_W + 6) + wobble, y: row * (COIN_H - 1) };
}

function Coin({ x, y, style }: { x: number; y: number; style?: CSSProperties }) {
  return (
    <div className="absolute" style={{ left: x, bottom: y, width: COIN_W, height: COIN_H + 5, ...style }}>
      <svg viewBox="0 0 34 12" width={COIN_W} height={COIN_H + 5} aria-hidden>
        <rect x="0.5" y="4" width="33" height="7" rx="3.5" fill="var(--iv-brass-strong)" />
        <ellipse cx="17" cy="4.5" rx="16.5" ry="4" fill="var(--iv-brass)" />
        <ellipse cx="17" cy="4.5" rx="11" ry="2.4" fill="none" stroke="var(--iv-brass-strong)" strokeWidth="0.9" opacity="0.7" />
      </svg>
    </div>
  );
}

export function CoinStack({ count, landingRef }: { count: number; landingRef?: Ref<HTMLDivElement> }) {
  const shown = Math.min(count, MAX_COINS);
  const next = coinPosition(shown % MAX_COINS);
  const height = PER_COLUMN * (COIN_H - 1) + 14;
  return (
    <div className="relative origin-bottom" style={{ width: COLUMNS * (COIN_W + 6), height }} aria-hidden>
      {count > 0 ? <div className="absolute bottom-0 left-0 right-0 h-px bg-line" /> : null}
      {Array.from({ length: shown }, (_, i) => {
        const p = coinPosition(i);
        return <Coin key={i} x={p.x} y={p.y} />;
      })}
      {/* Invisible target where the next coin lands. */}
      <div ref={landingRef} className="absolute" style={{ left: next.x, bottom: next.y, width: COIN_W, height: COIN_H + 5 }} />
      {count > MAX_COINS ? (
        <span className="absolute -right-1 -top-1 rounded-md bg-surface px-1 text-[10px] font-bold text-muted">×{count}</span>
      ) : null}
    </div>
  );
}

function useCountUp(target: number, startAt: number | null): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (startAt === null || prefersReducedMotion()) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const duration = 900;
    const tick = () => {
      const t = Math.min(1, (performance.now() - startAt) / duration);
      if (t < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, startAt]);
  return shown;
}

export function StackHeader({
  stacks,
  settings,
  payout,
  onOpenSaved,
}: {
  stacks: Stacks;
  settings: Settings;
  payout: Payout | null;
  onOpenSaved: () => void;
}) {
  const currency = settings.displayCurrency;
  const stack = stacks[currency];
  const total = stack?.totalMinor ?? 0;
  const coins = stack?.declineCount ?? 0;
  const landingRef = useRef<HTMLDivElement>(null);
  const [landedKey, setLandedKey] = useState<number | null>(null);
  const [flying, setFlying] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [countStart, setCountStart] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // While a payout coin is in the air, the stack shows the pre-payout total and one coin fewer.
  const inFlight = !!payout && payout.currency === currency && landedKey !== payout.key;
  const landed = !!payout && payout.currency === currency && landedKey === payout.key;
  const target = inFlight ? payout.toTotal - payout.amountMinor : landed ? Math.max(total, payout.toTotal) : total;
  const shownTotal = useCountUp(target, countStart);
  const shownCoins = inFlight ? payout.toCoins - 1 : landed ? Math.max(coins, payout.toCoins) : coins;

  useLayoutEffect(() => {
    if (!payout || payout.currency !== currency || landedKey === payout.key) return;
    const target = landingRef.current?.getBoundingClientRect();
    if (!target || prefersReducedMotion()) {
      setLandedKey(payout.key);
      setCountStart(performance.now());
      setToast(payout.copy);
      return;
    }
    const x = payout.from.left + payout.from.width / 2 - COIN_W / 2;
    const y = payout.from.top + payout.from.height / 2 - 6;
    setFlying({ x, y, dx: target.left - x, dy: target.top - y });
  }, [payout, currency, landedKey]);

  const flyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = flyRef.current;
    if (!flying || !el || !payout) return;
    const { dx, dy } = flying;
    // An arc: up and over, then down onto the stack.
    const fly = el.animate(
      [
        { transform: 'translate(0,0) scale(1.4) rotate(0deg)', offset: 0 },
        { transform: `translate(${dx * 0.45}px, ${Math.min(dy, 0) - 70}px) scale(1.25) rotate(160deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy - 18}px) scale(1) rotate(360deg)`, offset: 0.85 },
        { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(360deg)`, offset: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' },
    );
    fly.finished.then(() => {
      // Landing: the stack gets its coin, with a little squash.
      setFlying(null);
      setLandedKey(payout.key);
      setCountStart(performance.now());
      setToast(payout.copy);
      if (settings.lockSound) playCoinSound(1 + Math.random() * 0.1);
      landingRef.current?.parentElement?.animate(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.94)', offset: 0.3 }, { transform: 'scaleY(1)' }],
        { duration: SPRINGS.coin.duration, easing: SPRINGS.coin.easing },
      );
    }, () => undefined);
  }, [flying, payout, settings.lockSound]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const next = nextMilestone(total, settings.milestones);
  const prevThreshold = [...settings.milestones].map((m) => m.amountMinor).filter((a) => a <= total).sort((a, b) => b - a)[0] ?? 0;
  const progress = next ? (total - prevThreshold) / (next.amountMinor - prevThreshold) : 1;
  const others = Object.values(stacks).filter((s) => s.currency !== currency && s.totalMinor > 0);

  return (
    <header className="relative px-4 pb-3 pt-4">
      <div className="flex items-end justify-between gap-3">
        <button onClick={onOpenSaved} className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-text" aria-label="Open your Saved Stack">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Saved Stack</div>
          <div
            className={`mt-1 text-[40px] font-[750] leading-none tracking-[-0.02em] tabular transition-colors duration-500 ${toast ? 'text-mint' : ''}`}
            aria-live="polite"
          >
            {formatMoney({ amountMinor: shownTotal, currency })}
          </div>
          <div className="mt-1.5 min-h-[18px] text-[12.5px] leading-snug text-muted">
            {toast ? (
              <span className="font-semibold text-mint">{toast}</span>
            ) : shownCoins ? (
              <>Stays yours. {shownCoins} {shownCoins === 1 ? 'thing' : 'things'} you didn’t buy.</>
            ) : (
              <>Every “no” lands here.</>
            )}
          </div>
        </button>
        <CoinStack count={shownCoins} landingRef={landingRef} />
      </div>
      {others.length ? (
        <div className="mt-1 text-[11.5px] text-muted tabular">+ {others.map((s) => formatMoney({ amountMinor: s.totalMinor, currency: s.currency })).join(' · ')}</div>
      ) : null}
      {next ? (
        <div className="mt-2.5" title={`Next milestone: ${formatMoney({ amountMinor: next.amountMinor, currency })}`}>
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-mint transition-[width] duration-700" style={{ width: `${Math.max(2, Math.min(100, progress * 100))}%` }} />
          </div>
          <div className="mt-1 text-right text-[11px] text-muted tabular">
            next: {formatMoney({ amountMinor: next.amountMinor, currency })}
            {next.equivalence ? ` · ${next.equivalence}` : ''}
          </div>
        </div>
      ) : null}
      {flying ? (
        <div ref={flyRef} className="pointer-events-none fixed z-50" style={{ left: flying.x, top: flying.y }}>
          <Coin x={0} y={0} style={{ position: 'relative' }} />
        </div>
      ) : null}
    </header>
  );
}
