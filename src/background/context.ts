/** Builds the PageContext a content script asks for when it lands on (or SPA-navigates to) a page. */
import { isActive, productKey } from '../lib/state';
import { repo } from '../lib/storage';
import { platformPacks } from '../lib/sitepack';
import { canonicalizeUrl, domainOf, extractProductId, findPack } from '../lib/url';
import type { PageContext } from '../types/messages';
import { getPacks } from './packs';

export async function pageContext(url: string, tabId: number | undefined): Promise<PageContext> {
  const [items, settings, packs, passes] = await Promise.all([
    repo.getItemList(),
    repo.getSettings(),
    getPacks(),
    repo.getCartPasses(),
  ]);
  const now = Date.now();
  const pack = findPack(url, packs);
  const domain = domainOf(url);
  const key = productKey({ domain, productId: extractProductId(url, pack), url: canonicalizeUrl(url, pack) });
  return {
    pack,
    platformPacks: platformPacks(packs),
    item: items.find((i) => isActive(i) && productKey(i) === key),
    released: items.find(
      (i) => i.state === 'released' && !i.earlyUnlock && productKey(i) === key && now - (i.decidedAt ?? 0) < 10 * 60_000,
    ),
    coolingOnDomain: items.filter((i) => i.state === 'cooling' && i.lockEnabled && i.domain === domain),
    cartPass: passes.some((p) => p.tabId === tabId && p.domain === domain && p.expiresAt > now),
    settings: {
      defaultCooldownHours: settings.defaultCooldownHours,
      unlockMinChars: settings.unlockMinChars,
      unlockWaitSeconds: settings.unlockWaitSeconds,
      lockSound: settings.lockSound,
    },
    now,
  };
}
