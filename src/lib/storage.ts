/**
 * The only module that touches chrome.storage.
 *
 * Reads are safe from anywhere (popup, options, extension pages). Writes happen only in the
 * service worker, serialised through one promise chain, so read-modify-write on `vault:items`
 * can't race. UI code asks the worker to change things via `lib/api.ts`.
 */
import { DEFAULT_META, mergeSettings } from './defaults';
import { KEYS, migrate, type Snapshot } from './migrate';
import type { Bypass, CartPass, Meta, PackHealth, Settings, SitePack, Stacks, VaultItem } from '../types';

export { KEYS } from './migrate';

export const SESSION_KEYS = {
  bypasses: 'vault:bypasses',
  cartPasses: 'vault:cartPasses',
} as const;

type ItemMap = Record<string, VaultItem>;

const local = () => chrome.storage.local;
const session = () => chrome.storage.session;

async function read<T>(key: string, fallback: T): Promise<T> {
  const got = await local().get(key);
  return (got[key] as T | undefined) ?? fallback;
}

let chain: Promise<unknown> = Promise.resolve();
/** Run writes one at a time, in order, even if an earlier one threw. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export const repo = {
  // ── Reads ───────────────────────────────────────────────────────────────
  async getItems(): Promise<ItemMap> {
    return read<ItemMap>(KEYS.items, {});
  },
  async getItemList(): Promise<VaultItem[]> {
    return Object.values(await repo.getItems());
  },
  async getItem(id: string): Promise<VaultItem | undefined> {
    return (await repo.getItems())[id];
  },
  async getStacks(): Promise<Stacks> {
    return read<Stacks>(KEYS.stack, {});
  },
  async getSettings(): Promise<Settings> {
    return mergeSettings(await read<Partial<Settings> | undefined>(KEYS.settings, undefined));
  },
  async getMeta(): Promise<Meta> {
    return { ...DEFAULT_META, ...(await read<Partial<Meta>>(KEYS.meta, {})) };
  },
  async getPackOverrides(): Promise<Record<string, SitePack>> {
    return read<Record<string, SitePack>>(KEYS.packs, {});
  },
  async getPackHealth(): Promise<Record<string, PackHealth>> {
    return read<Record<string, PackHealth>>(KEYS.packHealth, {});
  },
  /** Everything the popup needs in a single storage round trip (sub-100ms open). */
  async getPopupState(): Promise<{ items: ItemMap; stacks: Stacks; settings: Settings; meta: Meta }> {
    const got = await local().get([KEYS.items, KEYS.stack, KEYS.settings, KEYS.meta]);
    return {
      items: (got[KEYS.items] as ItemMap) ?? {},
      stacks: (got[KEYS.stack] as Stacks) ?? {},
      settings: mergeSettings(got[KEYS.settings] as Partial<Settings> | undefined),
      meta: { ...DEFAULT_META, ...(got[KEYS.meta] as Partial<Meta> | undefined) },
    };
  },
  async snapshot(): Promise<Snapshot> {
    const got = await local().get(null);
    return migrate(got, Date.now()).data;
  },

  // ── Writes (service worker only) ────────────────────────────────────────
  mutateItems<T = void>(fn: (items: ItemMap) => T | Promise<T>): Promise<T> {
    return serial(async () => {
      const items = { ...(await repo.getItems()) };
      const result = await fn(items);
      await local().set({ [KEYS.items]: items });
      return result;
    });
  },
  /** Items and stacks change together on a decline; write them atomically. */
  mutateItemsAndStacks<T = void>(fn: (items: ItemMap, stacks: Stacks) => { stacks: Stacks; result: T } | Promise<{ stacks: Stacks; result: T }>): Promise<T> {
    return serial(async () => {
      const got = await local().get([KEYS.items, KEYS.stack]);
      const items = { ...((got[KEYS.items] as ItemMap) ?? {}) };
      const { stacks, result } = await fn(items, (got[KEYS.stack] as Stacks) ?? {});
      await local().set({ [KEYS.items]: items, [KEYS.stack]: stacks });
      return result;
    });
  },
  updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return serial(async () => {
      const next = mergeSettings({ ...(await repo.getSettings()), ...patch });
      await local().set({ [KEYS.settings]: next });
      return next;
    });
  },
  updateMeta(fn: (m: Meta) => Meta): Promise<Meta> {
    return serial(async () => {
      const next = fn(await repo.getMeta());
      await local().set({ [KEYS.meta]: next });
      return next;
    });
  },
  setPackOverrides(packs: Record<string, SitePack>): Promise<void> {
    return serial(() => local().set({ [KEYS.packs]: packs }));
  },
  updatePackHealth(packId: string, hit: boolean, now: number): Promise<void> {
    return serial(async () => {
      const all = await repo.getPackHealth();
      const prev = all[packId] ?? {};
      all[packId] = hit ? { ...prev, lastHit: now } : { ...prev, lastMiss: now };
      await local().set({ [KEYS.packHealth]: all });
    });
  },
  /** Run migrations over whatever is stored. Never drops items. */
  migrateInPlace(): Promise<boolean> {
    return serial(async () => {
      const { data, changed } = migrate(await local().get(null), Date.now());
      if (changed) await writeSnapshot(data);
      return changed;
    });
  },
  replaceAll(s: Snapshot): Promise<void> {
    return serial(() => writeSnapshot(s));
  },
  clearAll(): Promise<void> {
    return serial(async () => {
      await local().clear();
      await session().clear();
    });
  },

  // ── Session (tab-scoped, cleared on browser restart — correct for tab IDs) ──
  async getBypasses(): Promise<Bypass[]> {
    const got = await session().get(SESSION_KEYS.bypasses);
    return (got[SESSION_KEYS.bypasses] as Bypass[]) ?? [];
  },
  setBypasses(list: Bypass[]): Promise<void> {
    return serial(() => session().set({ [SESSION_KEYS.bypasses]: list }));
  },
  async getCartPasses(): Promise<CartPass[]> {
    const got = await session().get(SESSION_KEYS.cartPasses);
    return (got[SESSION_KEYS.cartPasses] as CartPass[]) ?? [];
  },
  setCartPasses(list: CartPass[]): Promise<void> {
    return serial(() => session().set({ [SESSION_KEYS.cartPasses]: list }));
  },

  /** Subscribe to changes of the given local keys. Returns an unsubscribe function. */
  onChange(keys: string[], cb: () => void): () => void {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && keys.some((k) => k in changes)) cb();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
};

async function writeSnapshot(s: Snapshot): Promise<void> {
  await local().set({
    [KEYS.items]: s.items,
    [KEYS.stack]: s.stacks,
    [KEYS.settings]: s.settings,
    [KEYS.meta]: s.meta,
    [KEYS.packs]: s.packs,
  });
}
