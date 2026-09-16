import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/lib/defaults';
import { KEYS, mergeSnapshots, migrate, parseImport, toExport } from '../src/lib/migrate';

const NOW = new Date(2026, 8, 15).getTime();

describe('migrate', () => {
  it('upgrades a v0 store without dropping a single item', () => {
    const raw = {
      [KEYS.items]: {
        a: { id: 'a', url: 'https://www.amazon.in/dp/B0CX23V2ZK', title: 'Headphones', priceAtVault: { amountMinor: 100, currency: 'INR' }, state: 'cooling', vaultedAt: NOW, unlockAt: NOW + 24 * 3600_000 },
        b: { id: 'b', url: 'https://x.com/p', state: 'weird' }, // malformed, still kept
      },
      [KEYS.stack]: { totalMinor: 500, currency: 'INR', declineCount: 1, history: [] },
    };
    const { data, changed } = migrate(raw, NOW);
    expect(changed).toBe(true);
    expect(Object.keys(data.items).sort()).toEqual(['a', 'b']);
    expect(data.items.a).toMatchObject({ cooldownHours: 24, lockdown: false, lockEnabled: true, domain: 'amazon.in' });
    expect(data.items.b).toMatchObject({ state: 'cooling', title: 'Untitled item' });
    expect(data.stacks.INR?.totalMinor).toBe(500);
    expect(data.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.settings.defaultCooldownHours).toBe(72);
  });

  it('is a no-op on current data', () => {
    const first = migrate({}, NOW).data;
    const { changed } = migrate(
      { [KEYS.items]: first.items, [KEYS.stack]: first.stacks, [KEYS.meta]: first.meta, [KEYS.settings]: first.settings },
      NOW,
    );
    expect(changed).toBe(false);
  });
});

describe('export / import', () => {
  it('round-trips', () => {
    const snap = migrate({}, NOW).data;
    const json = JSON.parse(JSON.stringify(toExport(snap, NOW)));
    expect(parseImport(json, NOW).settings).toEqual(snap.settings);
  });

  it('rejects foreign files and future versions', () => {
    expect(() => parseImport({ hello: 1 }, NOW)).toThrow(/doesn't look like/);
    expect(() => parseImport({ app: 'impulse-vault', schemaVersion: 999 }, NOW)).toThrow(/newer version/);
  });

  it('merges stacks by item without double counting', () => {
    const base = migrate({}, NOW).data;
    const h = (itemId: string, amountMinor: number) => ({ itemId, amountMinor, at: NOW });
    const a = { ...base, stacks: { INR: { currency: 'INR', totalMinor: 300, declineCount: 2, history: [h('x', 100), h('y', 200)] } } };
    const b = { ...base, stacks: { INR: { currency: 'INR', totalMinor: 700, declineCount: 2, history: [h('y', 200), h('z', 500)] } } };
    expect(mergeSnapshots(a, b).stacks.INR).toMatchObject({ totalMinor: 800, declineCount: 3 });
  });
});
