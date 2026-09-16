/**
 * Layers 1 & 2 of the lock, via declarativeNetRequest: redirects fire before a single byte of
 * the retailer page loads — no selector rot, no SPA races. Rules are rebuilt wholesale from
 * storage (see lib/rules.ts). Passes are session rules scoped to one tab with `tabIds`, which
 * only session rules support — so the bypass is decided in the network stack, before the
 * redirect, not by a content script that would run too late.
 */
import {
  GATE_PATH,
  INTERSTITIAL_PATH,
  buildDynamicRules,
  buildSessionRules,
  cartMatches,
  finaliseRules,
  gateMatches,
  lockedItems,
  regexesIn,
  sameRules,
  type BuiltRule,
} from '../lib/rules';
import { repo } from '../lib/storage';
import { MINUTE } from '../lib/time';
import { hostMatchesDomain, parseUrl } from '../lib/url';
import type { SitePack, VaultItem } from '../types';
import { ALARM, scheduleAt } from './alarms';
import { getPacks } from './packs';

const base = () => chrome.runtime.getURL('');

async function packResolver(): Promise<(i: Pick<VaultItem, 'packId' | 'domain'>) => SitePack | undefined> {
  const packs = await getPacks();
  return (i) => packs.find((p) => p.id === i.packId) ?? packs.find((p) => p.domains.some((d) => hostMatchesDomain(i.domain, d)));
}

const regexOk = new Map<string, boolean>();
/**
 * RE2 rejects regexes JS accepts - most often 'memoryLimitExceeded' on a long domain or product
 * slug, which is ordinary for brand-owned stores. Ask Chrome, cache the answer, and let
 * finaliseRules swap in the urlFilter form for the ones it refuses.
 */
async function rejectedRegexes(built: BuiltRule[]): Promise<Set<string>> {
  const rejected = new Set<string>();
  for (const re of regexesIn(built)) {
    if (!regexOk.has(re)) {
      const res = await chrome.declarativeNetRequest.isRegexSupported({ regex: re, isCaseSensitive: false });
      regexOk.set(re, res.isSupported);
      if (!res.isSupported) console.debug('[impulse-vault] regex refused, using urlFilter instead:', res.reason);
    }
    if (!regexOk.get(re)) rejected.add(re);
  }
  return rejected;
}

let chain: Promise<void> = Promise.resolve();
/** Serialised: overlapping syncs must not interleave remove/add. */
export function applyRules(): Promise<void> {
  chain = chain.then(doApply, doApply);
  return chain;
}

async function doApply(): Promise<void> {
  const [items, packFor, bypasses, passes] = await Promise.all([
    repo.getItemList(),
    packResolver(),
    repo.getBypasses(),
    repo.getCartPasses(),
  ]);
  const now = Date.now();
  const builtDynamic = buildDynamicRules({ items, packFor, base: base(), extensionId: chrome.runtime.id });
  const rejectedDynamic = await rejectedRegexes(builtDynamic);
  const dynamic = finaliseRules(builtDynamic, (re) => rejectedDynamic.has(re));
  const have = await chrome.declarativeNetRequest.getDynamicRules();
  if (!sameRules(have, dynamic)) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: have.map((r) => r.id), addRules: dynamic });
  }

  const liveBypasses = bypasses.filter((b) => b.expiresAt > now);
  const livePasses = passes.filter((p) => p.expiresAt > now);
  if (liveBypasses.length !== bypasses.length) await repo.setBypasses(liveBypasses);
  if (livePasses.length !== passes.length) await repo.setCartPasses(livePasses);
  const builtSession = buildSessionRules({ items, packFor }, liveBypasses, livePasses, now);
  const rejectedSession = await rejectedRegexes(builtSession);
  const session = finaliseRules(builtSession, (re) => rejectedSession.has(re), true);
  const haveSession = await chrome.declarativeNetRequest.getSessionRules();
  if (!sameRules(haveSession, session)) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: haveSession.map((r) => r.id), addRules: session });
  }
  const nextExpiry = Math.min(...liveBypasses.map((b) => b.expiresAt), ...livePasses.map((p) => p.expiresAt));
  await scheduleAt(ALARM.passes, Number.isFinite(nextExpiry) ? nextExpiry : null);
}

/** Only http(s) URLs that really are this item's page — never whatever a hostile page put in our gate's hash. */
async function safeProductUrl(item: VaultItem, url: string): Promise<string> {
  const packFor = await packResolver();
  const u = parseUrl(url);
  return u && gateMatches(item, packFor(item), u.toString()) ? u.toString() : item.url;
}

/** "View the page anyway": a 30-minute pass for this tab, then go there. */
export async function passGate(tabId: number, id: string, url: string): Promise<void> {
  const item = await repo.getItem(id);
  if (!item || item.state !== 'cooling') {
    // Stale gate (timer ran out, or decided elsewhere): make sure no rule is left, then go.
    await applyRules();
    await chrome.tabs.update(tabId, { url: item?.url ?? url });
    return;
  }
  if (item.lockdown) throw new Error('This one is in lockdown. Unlock it early if it really can’t wait.');
  const { bypassMinutes } = await repo.getSettings();
  const now = Date.now();
  const list = (await repo.getBypasses()).filter((b) => b.expiresAt > now && !(b.tabId === tabId && b.itemId === id));
  list.push({ tabId, itemId: id, expiresAt: now + bypassMinutes * MINUTE });
  await repo.setBypasses(list);
  await applyRules();
  await chrome.tabs.update(tabId, { url: await safeProductUrl(item, url) });
}

/** "Something else in my cart": a short cart pass for this tab and domain. */
export async function passCart(tabId: number, domain: string, url: string): Promise<void> {
  const now = Date.now();
  const list = (await repo.getCartPasses()).filter((p) => p.expiresAt > now && !(p.tabId === tabId && p.domain === domain));
  list.push({ tabId, domain, expiresAt: now + 10 * MINUTE });
  await repo.setCartPasses(list);
  await applyRules();
  const u = parseUrl(url);
  await chrome.tabs.update(tabId, { url: u && hostMatchesDomain(u.hostname, domain) ? u.toString() : `https://www.${domain}/` });
}

export async function dropTab(tabId: number): Promise<void> {
  const [b, p] = await Promise.all([repo.getBypasses(), repo.getCartPasses()]);
  if (!b.some((x) => x.tabId === tabId) && !p.some((x) => x.tabId === tabId)) return;
  await repo.setBypasses(b.filter((x) => x.tabId !== tabId));
  await repo.setCartPasses(p.filter((x) => x.tabId !== tabId));
  await applyRules();
}

/**
 * Backstop for navigations DNR can't see — SPA route changes (pushState never hits the network)
 * and any request the rules missed. If a tab lands on a locked product or a locked cart without a
 * pass, send it where the redirect would have.
 */
export async function checkTab(tabId: number, url: string): Promise<void> {
  const u = parseUrl(url);
  if (!u) return;
  const items = lockedItems(await repo.getItemList());
  if (!items.length) return;
  const packFor = await packResolver();
  const now = Date.now();
  const [bypasses, passes] = await Promise.all([repo.getBypasses(), repo.getCartPasses()]);
  for (const item of items) {
    if (!hostMatchesDomain(u.hostname, item.domain)) continue;
    if (gateMatches(item, packFor(item), url)) {
      if (bypasses.some((b) => b.tabId === tabId && b.itemId === item.id && b.expiresAt > now) && !item.lockdown) return;
      await chrome.tabs.update(tabId, { url: `${base()}${GATE_PATH}?id=${encodeURIComponent(item.id)}#${url}` });
      return;
    }
  }
  const onDomain = items.find((i) => hostMatchesDomain(u.hostname, i.domain));
  if (onDomain && cartMatches(onDomain.domain, packFor(onDomain), url)) {
    if (passes.some((p) => p.tabId === tabId && p.domain === onDomain.domain && p.expiresAt > now)) return;
    await chrome.tabs.update(tabId, { url: `${base()}${INTERSTITIAL_PATH}?d=${encodeURIComponent(onDomain.domain)}#${url}` });
  }
}
