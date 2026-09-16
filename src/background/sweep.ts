/**
 * The reconciliation sweep: the real timer guarantee. Runs on every worker start, every
 * 5 minutes, and whenever a per-item alarm fires. Wall clock vs `unlockAt` is the only truth,
 * so a browser closed for the whole cooldown catches up on the first sweep after it reopens.
 */
import { planSweep, transition } from '../lib/state';
import { repo } from '../lib/storage';
import { closeOffscreen, scrapeUrl } from './offscreen';
import { notifyRipe } from './notify';
import { packById } from './packs';
import { sync } from './sync';
import { decline } from './vault';

let running: Promise<void> | null = null;
let again = false;

/** Single-flight: overlapping triggers coalesce into at most one extra run. */
export function runSweep(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await sweepOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function sweepOnce(): Promise<void> {
  const now = Date.now();
  const settings = await repo.getSettings();
  const plan = planSweep(await repo.getItemList(), now, settings.expiryDays);

  if (plan.toRipen.length) {
    await repo.mutateItems((items) => {
      for (const id of plan.toRipen) {
        const item = items[id];
        if (item?.state === 'cooling' && item.unlockAt <= now) items[id] = transition(item, { type: 'ripen', now });
      }
    });
  }
  // Lock lifts before anything slow happens (rules, alarms, badge).
  await sync();

  // Ripe and ignored for N days: softly auto-declined. It still counts — the money wasn't spent.
  for (const id of plan.toExpire) await decline(id, { auto: true }).catch(() => undefined);

  await checkRipePrices();
  await notifyRipe(settings);
}

/** Re-scrape once per ripe item so the verdict shows today's price (or "sold out"). */
async function checkRipePrices(): Promise<void> {
  const todo = (await repo.getItemList()).filter((i) => i.state === 'ripe' && !i.priceCheckedAt).slice(0, 10);
  if (!todo.length) return;
  for (const item of todo) {
    const ex = await scrapeUrl(item.url, await packById(item.packId));
    await repo.mutateItems((items) => {
      const cur = items[item.id];
      if (!cur) return;
      const samePrice = ex?.price && ex.price.currency === cur.priceAtVault.currency;
      items[item.id] = {
        ...cur,
        priceCheckedAt: Date.now(),
        ...(samePrice ? { priceAtRipen: ex!.price, currentPrice: ex!.price } : {}),
        ...(ex?.inStock === false ? { soldOut: true } : {}),
      };
    });
  }
  await closeOffscreen();
}
