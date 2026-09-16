/**
 * Site packs: view, edit, add, reset. A pack whose selectors stopped matching gets a quiet
 * "may be outdated" note — extraction has already fallen back to the generic strategies.
 */
import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import { BUILTIN_PACKS } from '../lib/builtin-packs';
import { effectivePacks, validatePack } from '../lib/sitepack';
import type { PackHealth, SitePack } from '../types';
import { Badge, Button, Card, Note } from './fields';

const TEMPLATE = `{
  "id": "example.com",
  "name": "Example Store",
  "domains": ["example.com"],
  "currency": "INR",
  "productIdPattern": "/p/(\\\\d+)",
  "gatePathPattern": "p/{id}",
  "selectors": {
    "title": ["h1.product-title"],
    "price": [".price-now"],
    "addToCart": ["button.add-to-cart"],
    "checkout": ["button.checkout"]
  },
  "cartPaths": ["cart", "checkout"]
}`;

function isValidSelector(sel: string): boolean {
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

export function Sites({ overrides, health }: { overrides: Record<string, SitePack>; health: Record<string, PackHealth> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [granted, setGranted] = useState<string[]>([]);
  const packs = effectivePacks(BUILTIN_PACKS, overrides);

  useEffect(() => {
    chrome.permissions.getAll().then((p) => setGranted(p.origins ?? []));
  }, [overrides]);

  const hasAccess = (pack: SitePack) =>
    pack.domains.every((d) => granted.some((o) => o === `https://*.${d}/*` || o === `https://${d}/*` || o === '<all_urls>' || o === 'https://*/*'));

  const save = async (id: string | null) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setErrors([`That isn't valid JSON: ${(e as Error).message}`]);
      return;
    }
    const result = validatePack(parsed, isValidSelector);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const next = { ...overrides };
    if (id && id !== result.pack.id) delete next[id];
    next[result.pack.id] = result.pack;
    await call('packs/set', { packs: next });
    setEditing(null);
    setErrors([]);
  };

  const reset = async (id: string) => {
    const next = { ...overrides };
    delete next[id];
    await call('packs/set', { packs: next });
  };

  const requestAccess = (pack: SitePack) => {
    chrome.permissions.request({ origins: pack.domains.map((d) => `https://*.${d}/*`) }).then(
      (ok) => {
        if (ok) void chrome.permissions.getAll().then((p) => setGranted(p.origins ?? []));
      },
      () => undefined,
    );
  };

  return (
    <Card
      title="Supported sites"
      subtitle="Packs tell Impulse Vault where the title, price and buy buttons are, and which paths are the cart. Without one, it falls back to JSON-LD, microdata, OpenGraph and plain heuristics — which works on most stores."
    >
      <div className="grid gap-2">
        {packs.map((pack) => {
          const builtin = BUILTIN_PACKS.find((b) => b.id === pack.id);
          const edited = !!overrides[pack.id];
          const h = health[pack.id];
          const stale = !!h?.lastMiss && (!h.lastHit || h.lastMiss > h.lastHit);
          const access = hasAccess(pack);
          return (
            <div key={pack.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{pack.name}</span>
                <span className="text-[12.5px] text-muted">{pack.domains.join(', ')}</span>
                {edited ? <Badge tone="brass">edited</Badge> : null}
                {!builtin ? <Badge tone="mint">custom</Badge> : null}
                {stale ? <Badge tone="warn">pack may be outdated</Badge> : null}
                {!access ? <Badge tone="warn">no site access</Badge> : null}
                <span className="ml-auto flex gap-2">
                  {!access ? <Button onClick={() => requestAccess(pack)}>Allow access</Button> : null}
                  <Button
                    onClick={() => {
                      setEditing(editing === pack.id ? null : pack.id);
                      setDraft(JSON.stringify(pack, null, 2));
                      setErrors([]);
                    }}
                  >
                    {editing === pack.id ? 'Close' : 'Edit'}
                  </Button>
                  {edited || !builtin ? <Button onClick={() => void reset(pack.id)}>{builtin ? 'Reset' : 'Remove'}</Button> : null}
                </span>
              </div>
              {stale ? <Note tone="warn">Its selectors didn’t match the last product page we saw. Extraction still works through the generic strategies; the pack may need updating.</Note> : null}
              {!access ? <Note>Items from this site are tracked, but not locked, until Chrome grants access.</Note> : null}
              {editing === pack.id ? (
                <div className="mt-3">
                  <textarea
                    className="h-72 w-full rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text outline-none focus:border-brass"
                    value={draft}
                    spellCheck={false}
                    onChange={(e) => setDraft(e.currentTarget.value)}
                  />
                  {errors.length ? (
                    <ul className="m-0 mt-2 list-disc pl-5 text-[12.5px] text-danger">
                      {errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Button tone="primary" onClick={() => void save(pack.id)}>
                      Save pack
                    </Button>
                    <Button onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        {editing === '__new__' ? (
          <div>
            <textarea
              className="h-72 w-full rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text outline-none focus:border-brass"
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.currentTarget.value)}
            />
            {errors.length ? (
              <ul className="m-0 mt-2 list-disc pl-5 text-[12.5px] text-danger">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 flex gap-2">
              <Button tone="primary" onClick={() => void save(null)}>
                Add pack
              </Button>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => {
              setEditing('__new__');
              setDraft(TEMPLATE);
              setErrors([]);
            }}
          >
            Add a site pack
          </Button>
        )}
        <Note>
          The schema lives in <code className="rounded bg-surface-2 px-1">sites/schema.json</code>. Any store you vault from works without a pack — a pack just makes extraction and the lock sharper.
        </Note>
      </div>
    </Card>
  );
}
