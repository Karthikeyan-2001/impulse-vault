/**
 * declarativeNetRequest rules as a pure function of state: rules = f(items, packs, passes).
 * The worker throws away every rule and re-adds this list on each change and on every start,
 * so a stale rule can't survive a state transition (and there are no redirect loops from
 * leftovers).
 *
 * Priorities (explicit, because ordering across rulesets is otherwise unspecified):
 *   200  session  allow     cart pass for one tab ("something else in my cart")
 *   100  dynamic  redirect  cart/checkout block → interstitial        (hard)
 *    50  session  allow     per-tab bypass of a product gate, 30 min
 *    10  dynamic  redirect  product page → gate                       (soft)
 * The bypass (50) can never unlock the cart block (100): different URLs, lower priority.
 */
import { DEFAULT_CART_PATHS } from './sitepack';
import { escapeRegex, parseUrl } from './url';
import type { Bypass, CartPass, SitePack, VaultItem } from '../types';

export const PRIORITY = { gate: 10, bypass: 50, cart: 100, cartPass: 200 } as const;
export const GATE_PATH = 'pages/gate/index.html';
export const INTERSTITIAL_PATH = 'pages/interstitial/index.html';
const SESSION_ID_BASE = 10_000;

type Rule = chrome.declarativeNetRequest.Rule;

const domainRe = (domain: string) => `(?:[^/?#]+\\.)?${escapeRegex(domain)}`;
// Optional locale prefix: /en-in/, /hi/, Amazon's /-/hi/
const LOCALE = '(?:[a-z]{2}(?:[-_][a-z]{2})?/|-/[a-z_]+/)?';

/**
 * Regex for "this item's product page", robust to tracking params, slugs and locale prefixes.
 * With a product ID: the pack's gate path (e.g. `(?:dp|gp/product)/{id}`) anywhere in the path.
 * Without one: the canonical host + path, with any query/fragment after.
 */
export function gateRegex(item: Pick<VaultItem, 'url' | 'domain' | 'productId'>, pack?: SitePack): string | null {
  if (item.productId) {
    const id = escapeRegex(item.productId);
    const path = (pack?.gatePathPattern ?? '{id}').split('{id}').join(id);
    return `^https?://${domainRe(item.domain)}/(?:[^?#]*/)?${path}(?:[/?#].*)?$`;
  }
  const u = parseUrl(item.url);
  if (!u) return null;
  const host = u.hostname.replace(/^(www\d?|m|mobile)\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const query = u.search ? `\\?${escapeRegex(u.search.slice(1))}(?:[&#].*)?` : '(?:[?#].*)?';
  return `^https?://(?:www\\d?\\.|m\\.|mobile\\.)?${escapeRegex(host)}${escapeRegex(path)}/?${query}$`;
}

/** Regex for cart/checkout pages on a domain. */
export function cartRegex(domain: string, pack?: SitePack): string {
  const paths = (pack?.cartPaths?.length ? pack.cartPaths : DEFAULT_CART_PATHS).join('|');
  return `^https?://${domainRe(domain)}/${LOCALE}(?:${paths})(?:[/?#.]|$).*$`;
}

/** JS-side check using the exact same pattern the DNR rule uses (RE2 syntax here is JS-compatible). */
export function matches(regex: string | null, url: string): boolean {
  if (!regex) return false;
  try {
    return new RegExp(regex, 'i').test(url);
  } catch {
    return false;
  }
}

export interface RuleInputs {
  items: VaultItem[];
  packFor: (item: Pick<VaultItem, 'packId' | 'domain'>) => SitePack | undefined;
  /** chrome-extension://<id>/ */
  base: string;
  extensionId: string;
}

/** Items that are actually locked: cooling, and on a site we have access to. */
export function lockedItems(items: VaultItem[]): VaultItem[] {
  return items.filter((i) => i.state === 'cooling' && i.lockEnabled);
}

export function buildDynamicRules({ items, packFor, base, extensionId }: RuleInputs): Rule[] {
  const rules: Rule[] = [];
  let id = 1;
  const locked = lockedItems(items);
  for (const item of locked) {
    const regexFilter = gateRegex(item, packFor(item));
    if (!regexFilter) continue;
    rules.push({
      id: id++,
      priority: PRIORITY.gate,
      action: {
        type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
        redirect: { regexSubstitution: `${base}${GATE_PATH}?id=${encodeURIComponent(item.id)}#\\0` },
      },
      condition: {
        regexFilter,
        resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
        excludedInitiatorDomains: [extensionId],
      },
    });
  }
  const domains = new Map<string, SitePack | undefined>();
  for (const item of locked) if (!domains.has(item.domain)) domains.set(item.domain, packFor(item));
  for (const [domain, pack] of domains) {
    rules.push({
      id: id++,
      priority: PRIORITY.cart,
      action: {
        type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
        redirect: { regexSubstitution: `${base}${INTERSTITIAL_PATH}?d=${encodeURIComponent(domain)}#\\0` },
      },
      condition: {
        regexFilter: cartRegex(domain, pack),
        resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
        excludedInitiatorDomains: [extensionId],
      },
    });
  }
  return rules;
}

export function buildSessionRules(
  { items, packFor }: Pick<RuleInputs, 'items' | 'packFor'>,
  bypasses: Bypass[],
  cartPasses: CartPass[],
  now: number,
): Rule[] {
  const rules: Rule[] = [];
  let id = SESSION_ID_BASE;
  const byId = new Map(lockedItems(items).map((i) => [i.id, i]));
  for (const b of bypasses) {
    const item = byId.get(b.itemId);
    if (!item || item.lockdown || b.expiresAt <= now) continue;
    const regexFilter = gateRegex(item, packFor(item));
    if (!regexFilter) continue;
    rules.push({
      id: id++,
      priority: PRIORITY.bypass,
      action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
      condition: { regexFilter, resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType], tabIds: [b.tabId] },
    });
  }
  for (const p of cartPasses) {
    if (p.expiresAt <= now) continue;
    const pack = [...byId.values()].find((i) => i.domain === p.domain);
    rules.push({
      id: id++,
      priority: PRIORITY.cartPass,
      action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
      condition: {
        regexFilter: cartRegex(p.domain, pack ? packFor(pack) : undefined),
        resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType],
        tabIds: [p.tabId],
      },
    });
  }
  return rules;
}

/** Order-insensitive equality, to skip no-op rule updates. */
export function sameRules(a: Rule[], b: Rule[]): boolean {
  if (a.length !== b.length) return false;
  const key = (r: Rule) => JSON.stringify({ p: r.priority, a: r.action, c: r.condition });
  const as = a.map(key).sort();
  const bs = b.map(key).sort();
  return as.every((k, i) => k === bs[i]);
}
