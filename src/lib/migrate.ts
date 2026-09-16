/**
 * Storage schema migrations. Pure. The one rule: never drop an item. Items that are
 * malformed get repaired to something renderable, never deleted.
 */
import { DEFAULT_META, SCHEMA_VERSION, mergeSettings } from './defaults';
import { isCurrencyCode } from './money';
import { HOUR } from './time';
import { domainOf } from './url';
import type { Meta, SavedStack, Settings, SitePack, Stacks, VaultItem, VaultState } from '../types';

export const KEYS = {
  items: 'vault:items',
  stack: 'vault:stack',
  settings: 'vault:settings',
  meta: 'vault:meta',
  packs: 'vault:packs',
  packHealth: 'vault:packHealth',
} as const;

export interface Snapshot {
  items: Record<string, VaultItem>;
  stacks: Stacks;
  settings: Settings;
  meta: Meta;
  packs: Record<string, SitePack>;
}

const STATES: VaultState[] = ['cooling', 'ripe', 'released', 'declined', 'expired'];
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeItem(raw: Record<string, any>, fallbackCurrency: string, now: number): VaultItem {
  const vaultedAt = Number.isFinite(raw.vaultedAt) ? raw.vaultedAt : now;
  const unlockAt = Number.isFinite(raw.unlockAt) ? raw.unlockAt : vaultedAt + 72 * HOUR;
  const price = isObj(raw.priceAtVault) && Number.isInteger(raw.priceAtVault.amountMinor)
    ? { amountMinor: raw.priceAtVault.amountMinor, currency: isCurrencyCode(raw.priceAtVault.currency) ? raw.priceAtVault.currency : fallbackCurrency }
    : { amountMinor: 0, currency: fallbackCurrency };
  const url = typeof raw.url === 'string' ? raw.url : '';
  return {
    ...(raw as VaultItem),
    id: String(raw.id),
    url,
    domain: typeof raw.domain === 'string' && raw.domain ? raw.domain : domainOf(url),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Untitled item',
    priceAtVault: price,
    state: STATES.includes(raw.state) ? raw.state : 'cooling',
    vaultedAt,
    unlockAt,
    extractionConfidence: ['high', 'medium', 'low'].includes(raw.extractionConfidence) ? raw.extractionConfidence : 'medium',
    cooldownHours: Number.isFinite(raw.cooldownHours) && raw.cooldownHours > 0
      ? raw.cooldownHours
      : Math.max(1, Math.round((unlockAt - vaultedAt) / HOUR)),
    lockdown: raw.lockdown === true,
    lockEnabled: raw.lockEnabled !== false,
  };
}

function normalizeStacks(raw: unknown): Stacks {
  if (!isObj(raw)) return {};
  // v0 stored a single SavedStack (the spec's original shape): wrap it by currency.
  if (typeof raw.totalMinor === 'number' && typeof raw.currency === 'string') {
    const s = raw as SavedStack;
    return { [s.currency]: { ...s, history: Array.isArray(s.history) ? s.history : [] } };
  }
  const out: Stacks = {};
  for (const [cur, s] of Object.entries(raw)) {
    if (isObj(s) && typeof s.totalMinor === 'number') {
      out[cur] = { totalMinor: s.totalMinor, currency: cur, declineCount: s.declineCount ?? 0, history: Array.isArray(s.history) ? s.history : [] };
    }
  }
  return out;
}

/** Take whatever is in storage (any version) and return the current shape. */
export function migrate(raw: Record<string, unknown>, now: number): { data: Snapshot; changed: boolean } {
  const metaRaw = isObj(raw[KEYS.meta]) ? (raw[KEYS.meta] as Partial<Meta>) : undefined;
  const fromVersion = metaRaw?.schemaVersion ?? 0;
  const settings = mergeSettings(isObj(raw[KEYS.settings]) ? (raw[KEYS.settings] as Partial<Settings>) : undefined);

  const items: Record<string, VaultItem> = {};
  const rawItems = raw[KEYS.items];
  const itemList = Array.isArray(rawItems) ? rawItems : isObj(rawItems) ? Object.values(rawItems) : [];
  for (const it of itemList) {
    if (isObj(it) && it.id != null) {
      const item = normalizeItem(it, settings.displayCurrency, now);
      items[item.id] = item;
    }
  }

  const data: Snapshot = {
    items,
    stacks: normalizeStacks(raw[KEYS.stack]),
    settings,
    meta: { ...DEFAULT_META, ...metaRaw, celebrated: metaRaw?.celebrated ?? {}, schemaVersion: SCHEMA_VERSION },
    packs: isObj(raw[KEYS.packs]) ? (raw[KEYS.packs] as Record<string, SitePack>) : {},
  };
  return { data, changed: fromVersion !== SCHEMA_VERSION };
}

export interface ExportBlob {
  app: 'impulse-vault';
  schemaVersion: number;
  exportedAt: number;
  items: Record<string, VaultItem>;
  stacks: Stacks;
  settings: Settings;
  meta: Meta;
  packs: Record<string, SitePack>;
}

export function toExport(s: Snapshot, now: number): ExportBlob {
  return { app: 'impulse-vault', schemaVersion: SCHEMA_VERSION, exportedAt: now, ...s };
}

/** Validate an imported file and bring it up to the current schema. Throws with a readable message. */
export function parseImport(json: unknown, now: number): Snapshot {
  if (!isObj(json) || json.app !== 'impulse-vault') {
    throw new Error("That file doesn't look like an Impulse Vault export.");
  }
  if (typeof json.schemaVersion === 'number' && json.schemaVersion > SCHEMA_VERSION) {
    throw new Error('That export is from a newer version of Impulse Vault. Update the extension first.');
  }
  const { data } = migrate(
    {
      [KEYS.items]: json.items,
      [KEYS.stack]: json.stacks,
      [KEYS.settings]: json.settings,
      [KEYS.meta]: { ...(isObj(json.meta) ? json.meta : {}), schemaVersion: json.schemaVersion },
      [KEYS.packs]: json.packs,
    },
    now,
  );
  return data;
}

/** Merge import: union items by id (incoming wins), union stack history by item, recompute totals. */
export function mergeSnapshots(current: Snapshot, incoming: Snapshot): Snapshot {
  const stacks: Stacks = {};
  for (const cur of new Set([...Object.keys(current.stacks), ...Object.keys(incoming.stacks)])) {
    const byItem = new Map<string, SavedStack['history'][number]>();
    for (const h of current.stacks[cur]?.history ?? []) byItem.set(h.itemId, h);
    for (const h of incoming.stacks[cur]?.history ?? []) byItem.set(h.itemId, h);
    const history = [...byItem.values()].sort((a, b) => a.at - b.at);
    stacks[cur] = {
      currency: cur,
      history,
      totalMinor: history.reduce((sum, h) => sum + h.amountMinor, 0),
      declineCount: history.length,
    };
  }
  return {
    items: { ...current.items, ...incoming.items },
    stacks,
    settings: current.settings,
    meta: current.meta,
    packs: { ...current.packs, ...incoming.packs },
  };
}
