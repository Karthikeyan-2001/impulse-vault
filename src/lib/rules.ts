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
 *
 * Two condition shapes per rule. The regex form is preferred because `regexSubstitution` can
 * carry the original URL into the gate. But Chrome's RE2 has a per-rule compiled-memory budget
 * that a long domain or a long product slug blows through (measured: rejected around 50-60
 * literal characters) - and a rejected rule means no lock at all. So every rule also carries a
 * urlFilter fallback, which has no such budget; the worker swaps it in when RE2 says no.
 */
import { DEFAULT_CART_PATHS } from './sitepack';
import { canonicalizeUrl, escapeRegex, parseUrl } from './url';
import type { Bypass, CartPass, SitePack, VaultItem } from '../types';

export const PRIORITY = { gate: 10, bypass: 50, cart: 100, cartPass: 200 } as const;
export const GATE_PATH = 'pages/gate/index.html';
export const INTERSTITIAL_PATH = 'pages/interstitial/index.html';
const SESSION_ID_BASE = 10_000;

type Rule = chrome.declarativeNetRequest.Rule;
type Condition = Rule['condition'];
const MAIN_FRAME = ['main_frame' as chrome.declarativeNetRequest.ResourceType];
const REDIRECT = 'redirect' as chrome.declarativeNetRequest.RuleActionType;
const ALLOW = 'allow' as chrome.declarativeNetRequest.RuleActionType;

/** A rule plus the cheap urlFilter form(s) to use if RE2 rejects its regex. */
export interface BuiltRule {
  rule: Rule;
  fallback: Rule[];
}

const domainRe = (domain: string) => `(?:[^/?#]+\\.)?${escapeRegex(domain)}`;
// Optional locale prefix: /en-in/, /hi/, Amazon's /-/hi/
const LOCALE = '(?:[a-z]{2}(?:[-_][a-z]{2})?/|-/[a-z_]+/)?';

function hostAndPath(url: string): { host: string; path: string; query: string } | null {
  const u = parseUrl(url);
  if (!u) return null;
  return {
    host: u.hostname.replace(/^(www\d?|m|mobile)\./, ''),
    path: u.pathname.replace(/\/+$/, ''),
    query: u.search,
  };
}

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
  const parts = hostAndPath(item.url);
  if (!parts) return null;
  const query = parts.query ? `\\?${escapeRegex(parts.query.slice(1))}(?:[&#].*)?` : '(?:[?#].*)?';
  return `^https?://(?:www\\d?\\.|m\\.|mobile\\.)?${escapeRegex(parts.host)}${escapeRegex(parts.path)}/?${query}$`;
}

/**
 * The same match as a urlFilter: no regex budget, case-insensitive, matches any query suffix.
 * `||` anchors to the domain, so subdomains and scheme don't matter.
 */
export function gateUrlFilter(item: Pick<VaultItem, 'url' | 'domain' | 'productId'>, _pack?: SitePack): string | null {
  if (item.productId) return `||${item.domain}/*${item.productId}`;
  const parts = hostAndPath(item.url);
  if (!parts) return null;
  return `||${parts.host}${parts.path}${parts.query}`;
}

/** Does this URL belong to the item's product page? Mirrors whichever condition is in force. */
export function gateMatches(item: Pick<VaultItem, 'url' | 'domain' | 'productId'>, pack: SitePack | undefined, url: string): boolean {
  const re = gateRegex(item, pack);
  if (re && matches(re, url)) return true;
  // urlFilter equivalent, for the items whose regex was too big for RE2.
  const target = hostAndPath(url);
  const own = hostAndPath(item.url);
  if (!target || !own) return false;
  if (target.host !== own.host && !target.host.endsWith(`.${own.host}`)) return false;
  if (item.productId) return (target.path + target.query).includes(item.productId);
  return target.path === own.path && (!own.query || target.query.startsWith(own.query));
}

export function cartPaths(pack?: SitePack): string[] {
  return pack?.cartPaths?.length ? pack.cartPaths : DEFAULT_CART_PATHS;
}

/** Regex for cart/checkout pages on a domain. */
export function cartRegex(domain: string, pack?: SitePack): string {
  return `^https?://${domainRe(domain)}/${LOCALE}(?:${cartPaths(pack).join('|')})(?:[/?#.]|$).*$`;
}

/** One urlFilter per cart path. Regex fragments that aren't plain paths are skipped. */
export function cartUrlFilters(domain: string, pack?: SitePack): { path: string; filter: string }[] {
  return cartPaths(pack)
    .filter((p) => /^[a-z0-9/_-]+$/i.test(p))
    .map((p) => ({ path: p, filter: `||${domain}/${p}` }));
}

export function matches(regex: string | null, url: string): boolean {
  if (!regex) return false;
  try {
    return new RegExp(regex, 'i').test(url);
  } catch {
    return false;
  }
}

/** Does this URL look like the cart/checkout of a domain? Covers both condition shapes. */
export function cartMatches(domain: string, pack: SitePack | undefined, url: string): boolean {
  if (matches(cartRegex(domain, pack), url)) return true;
  const parts = hostAndPath(url);
  if (!parts || (parts.host !== domain && !parts.host.endsWith(`.${domain}`))) return false;
  const path = parts.path.replace(/^\//, '').toLowerCase();
  return cartPaths(pack).some((p) => /^[a-z0-9/_-]+$/i.test(p) && (path === p.toLowerCase() || path.startsWith(`${p.toLowerCase()}/`)));
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

const condition = (extra: Partial<Condition>, extensionId?: string): Condition => ({
  resourceTypes: MAIN_FRAME,
  ...(extensionId ? { excludedInitiatorDomains: [extensionId] } : {}),
  ...extra,
});

export function buildDynamicRules({ items, packFor, base, extensionId }: RuleInputs): BuiltRule[] {
  const built: BuiltRule[] = [];
  const locked = lockedItems(items);

  for (const item of locked) {
    const pack = packFor(item);
    const regexFilter = gateRegex(item, pack);
    const urlFilter = gateUrlFilter(item, pack);
    if (!regexFilter && !urlFilter) continue;
    const gateUrl = `${base}${GATE_PATH}?id=${encodeURIComponent(item.id)}`;
    // The fallback can't carry the original URL, so the gate falls back to the canonical one.
    const fallback: Rule[] = urlFilter
      ? [{ id: 0, priority: PRIORITY.gate, action: { type: REDIRECT, redirect: { url: gateUrl } }, condition: condition({ urlFilter }, extensionId) }]
      : [];
    const rule: Rule = regexFilter
      ? {
          id: 0,
          priority: PRIORITY.gate,
          action: { type: REDIRECT, redirect: { regexSubstitution: `${gateUrl}#\\0` } },
          condition: condition({ regexFilter }, extensionId),
        }
      : fallback[0]!;
    built.push({ rule, fallback });
  }

  const domains = new Map<string, SitePack | undefined>();
  for (const item of locked) if (!domains.has(item.domain)) domains.set(item.domain, packFor(item));
  for (const [domain, pack] of domains) {
    const interstitial = `${base}${INTERSTITIAL_PATH}?d=${encodeURIComponent(domain)}`;
    built.push({
      rule: {
        id: 0,
        priority: PRIORITY.cart,
        action: { type: REDIRECT, redirect: { regexSubstitution: `${interstitial}#\\0` } },
        condition: condition({ regexFilter: cartRegex(domain, pack) }, extensionId),
      },
      // One rule per cart path; each carries the path so "continue to my cart" knows where to go.
      fallback: cartUrlFilters(domain, pack).map(({ path, filter }) => ({
        id: 0,
        priority: PRIORITY.cart,
        action: { type: REDIRECT, redirect: { url: `${interstitial}&p=${encodeURIComponent(path)}` } },
        condition: condition({ urlFilter: filter }, extensionId),
      })),
    });
  }
  return built;
}

export function buildSessionRules(
  { items, packFor }: Pick<RuleInputs, 'items' | 'packFor'>,
  bypasses: Bypass[],
  cartPasses: CartPass[],
  now: number,
): BuiltRule[] {
  const built: BuiltRule[] = [];
  const byId = new Map(lockedItems(items).map((i) => [i.id, i]));

  for (const b of bypasses) {
    const item = byId.get(b.itemId);
    if (!item || item.lockdown || b.expiresAt <= now) continue;
    const pack = packFor(item);
    const regexFilter = gateRegex(item, pack);
    const urlFilter = gateUrlFilter(item, pack);
    if (!regexFilter && !urlFilter) continue;
    const allow = (extra: Partial<Condition>): Rule => ({
      id: 0,
      priority: PRIORITY.bypass,
      action: { type: ALLOW },
      condition: condition({ ...extra, tabIds: [b.tabId] }),
    });
    built.push({ rule: regexFilter ? allow({ regexFilter }) : allow({ urlFilter: urlFilter! }), fallback: urlFilter ? [allow({ urlFilter })] : [] });
  }

  for (const p of cartPasses) {
    if (p.expiresAt <= now) continue;
    const item = [...byId.values()].find((i) => i.domain === p.domain);
    const pack = item ? packFor(item) : undefined;
    const allow = (extra: Partial<Condition>): Rule => ({
      id: 0,
      priority: PRIORITY.cartPass,
      action: { type: ALLOW },
      condition: condition({ ...extra, tabIds: [p.tabId] }),
    });
    built.push({
      rule: allow({ regexFilter: cartRegex(p.domain, pack) }),
      fallback: cartUrlFilters(p.domain, pack).map(({ filter }) => allow({ urlFilter: filter })),
    });
  }
  return built;
}

/**
 * Assign ids and swap in the urlFilter fallback wherever RE2 rejected the regex. A rule with a
 * rejected regex and no usable fallback is dropped rather than failing the whole update.
 */
export function finaliseRules(built: BuiltRule[], isRejected: (regex: string) => boolean, session = false): Rule[] {
  const out: Rule[] = [];
  let id = session ? SESSION_ID_BASE : 1;
  for (const b of built) {
    const regex = b.rule.condition.regexFilter;
    const use = regex && isRejected(regex) ? b.fallback : [b.rule];
    for (const rule of use) out.push({ ...rule, id: id++ });
  }
  return out;
}

/** Every regex the worker should ask Chrome about before applying these rules. */
export function regexesIn(built: BuiltRule[]): string[] {
  return built.map((b) => b.rule.condition.regexFilter).filter((r): r is string => !!r);
}

/** Order-insensitive equality, to skip no-op rule updates. */
export function sameRules(a: Rule[], b: Rule[]): boolean {
  if (a.length !== b.length) return false;
  const key = (r: Rule) => JSON.stringify({ p: r.priority, a: r.action, c: r.condition });
  const as = a.map(key).sort();
  const bs = b.map(key).sort();
  return as.every((k, i) => k === bs[i]);
}

/** The canonical URL for an item, used when a fallback rule couldn't carry the original. */
export function canonicalFor(item: Pick<VaultItem, 'url'>, pack?: SitePack): string {
  return canonicalizeUrl(item.url, pack);
}
