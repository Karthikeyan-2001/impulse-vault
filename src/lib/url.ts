import type { SitePack } from '../types';

/** Query params that identify a click, not a product. Kept when unsure. */
const TRACKING = new RegExp(
  '^(' +
    [
      'utm_.*', 'ref', 'ref_', 'tag', 'gclid', 'gclsrc', 'dclid', 'fbclid', 'msclkid', 'yclid',
      'twclid', 'ttclid', 'igshid', 'mc_cid', 'mc_eid', 'srsltid', '_ga', '_gl', 'li_fat_id',
      'affid', 'affextparam\\d*', 'spm', 'otracker\\d*', 'pd_rd_.*', 'pf_rd_.*', 'content-id',
      'linkcode', 'linkid', 'ascsubtag',
    ].join('|') +
    ')$',
  'i',
);

export function isTrackingParam(name: string): boolean {
  return TRACKING.test(name);
}

export function parseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** "www.amazon.in" → "amazon.in"; "m.myntra.com" → "myntra.com". */
export function domainOf(urlOrHost: string): string {
  const host = parseUrl(urlOrHost)?.hostname ?? urlOrHost;
  return host.toLowerCase().replace(/^(www\d?|m|mobile)\./, '');
}

export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith('.' + d);
}

export function findPack(urlOrHost: string, packs: SitePack[]): SitePack | undefined {
  const host = parseUrl(urlOrHost)?.hostname ?? urlOrHost;
  return packs.find((p) => p.domains.some((d) => hostMatchesDomain(host, d)));
}

export function extractProductId(url: string, pack: SitePack | undefined): string | undefined {
  if (!pack?.productIdPattern) return undefined;
  const u = parseUrl(url);
  if (!u) return undefined;
  try {
    const m = new RegExp(pack.productIdPattern).exec(u.pathname + u.search);
    return m?.[1] || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The URL we store and dedupe on. With a pack and a product ID, it's the pack's canonical
 * template ("https://www.amazon.in/dp/B0CX23V2ZK"). Otherwise: no hash, no tracking params,
 * remaining params sorted, no trailing slash.
 */
export function canonicalizeUrl(url: string, pack?: SitePack): string {
  const u = parseUrl(url);
  if (!u) return url;
  const id = extractProductId(url, pack);
  if (id && pack?.canonicalUrl) return pack.canonicalUrl.replace('{id}', id);

  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const keep = pack?.keepParams;
  const kept = [...u.searchParams.entries()].filter(([k]) => (keep ? keep.includes(k) : !isTrackingParam(k)));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

/** Escape a literal for RE2 (DNR regexFilter) and JS RegExp alike. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function originPattern(url: string): string | null {
  const u = parseUrl(url);
  return u ? `${u.protocol}//${u.hostname}/*` : null;
}
