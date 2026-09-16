import { BUILTIN_PACKS } from '../lib/builtin-packs';
import { effectivePacks } from '../lib/sitepack';
import { KEYS, repo } from '../lib/storage';
import { findPack } from '../lib/url';
import type { SitePack } from '../types';

let cache: SitePack[] | null = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && KEYS.packs in changes) cache = null;
});

export async function getPacks(): Promise<SitePack[]> {
  cache ??= effectivePacks(BUILTIN_PACKS, await repo.getPackOverrides());
  return cache;
}

export async function packFor(url: string): Promise<SitePack | undefined> {
  return findPack(url, await getPacks());
}

export async function packById(id: string | undefined): Promise<SitePack | undefined> {
  return id ? (await getPacks()).find((p) => p.id === id) : undefined;
}
