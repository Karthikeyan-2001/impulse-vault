/**
 * Sites beyond the built-in packs. When the user grants access to an origin (from the vault
 * card's "Lock this site too"), we register the content script there and upgrade any items on
 * that site from tracked-only to locked. This runs off `permissions.onAdded`, so it still
 * happens if the popup closed while Chrome's permission prompt was up.
 */
import { repo } from '../lib/storage';
import { parseUrl } from '../lib/url';
import { sync } from './sync';

const SCRIPT_IDS = { isolated: 'iv-dynamic', main: 'iv-dynamic-main' };

function staticOrigins(): string[] {
  return (chrome.runtime.getManifest().host_permissions ?? []) as string[];
}

/** Origins the user granted on top of the manifest's built-in retailers. */
async function grantedExtraOrigins(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  const builtin = new Set(staticOrigins());
  return origins.filter((o) => !builtin.has(o) && o !== '<all_urls>' && /^https?:\/\//.test(o));
}

export async function syncDynamicContentScripts(): Promise<void> {
  const origins = await grantedExtraOrigins();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: Object.values(SCRIPT_IDS) });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  if (!origins.length) return;
  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_IDS.main, matches: origins, js: ['main-world.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true },
    { id: SCRIPT_IDS.isolated, matches: origins, js: ['content.js'], runAt: 'document_start', persistAcrossSessions: true },
  ]);
}

/** Recompute `lockEnabled` for every active item from the permissions we actually hold. */
export async function reconcileLockAccess(): Promise<void> {
  const items = await repo.getItemList();
  const checks = await Promise.all(
    items.map(async (i) => {
      const u = parseUrl(i.url);
      const has = u ? await chrome.permissions.contains({ origins: [`${u.protocol}//${u.hostname}/*`] }).catch(() => false) : false;
      return [i.id, has] as const;
    }),
  );
  const changed = checks.filter(([id, has]) => items.find((i) => i.id === id)?.lockEnabled !== has);
  if (!changed.length) return;
  await repo.mutateItems((all) => {
    for (const [id, has] of changed) if (all[id]) all[id] = { ...all[id]!, lockEnabled: has };
  });
}

export async function onPermissionsChanged(): Promise<void> {
  await syncDynamicContentScripts();
  await reconcileLockAccess();
  await sync();
}
