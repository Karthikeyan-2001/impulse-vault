/**
 * "Work on every shopping site." Off by default and opt-in, because granting it means Chrome
 * asks for access to every site — a real trade, and one the user should make deliberately.
 */
import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import { Card, Note, Row, Toggle } from './fields';

const ALL_SITES = ['https://*/*'];

export function AllSites({ builtinDomains }: { builtinDomains: string[] }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const read = () => chrome.permissions.contains({ origins: ALL_SITES }).then(setOn, () => setOn(false));
  useEffect(() => {
    void read();
    const listener = () => void read();
    chrome.permissions.onAdded.addListener(listener);
    chrome.permissions.onRemoved.addListener(listener);
    return () => {
      chrome.permissions.onAdded.removeListener(listener);
      chrome.permissions.onRemoved.removeListener(listener);
    };
  }, []);

  const toggle = (next: boolean) => {
    setBusy(true);
    const done = (ok: boolean) => {
      setBusy(false);
      if (ok) {
        void call('site/enable', { origin: ALL_SITES[0]! });
        void read();
      }
    };
    if (next) chrome.permissions.request({ origins: ALL_SITES }).then(done, () => setBusy(false));
    else chrome.permissions.remove({ origins: ALL_SITES }).then(done, () => setBusy(false));
  };

  return (
    <Card
      title="Where it works"
      subtitle={`Out of the box, Impulse Vault works on ${builtinDomains.length} stores it ships with. Anywhere else, you can still vault from the toolbar or the right-click menu — the timer, the verdict and the Saved Stack all work — but nothing gets locked until that site is allowed.`}
    >
      <Row
        label="Work on every shopping site"
        hint={
          on
            ? 'On. Vault buttons, the gate and the checkout block work on any store, including brand-owned ones.'
            : 'Chrome will ask for access to all sites. That’s a big ask, so it’s off by default — you can also allow stores one at a time, from the item in the popup or the list below.'
        }
      >
        {on === null ? <span className="text-[12.5px] text-muted">checking…</span> : <Toggle label="Work on every shopping site" checked={on} onChange={toggle} />}
      </Row>
      {busy ? <Note>Waiting for Chrome’s permission prompt…</Note> : null}
      {on ? (
        <Note tone="mint">
          On a page that isn’t a product page and isn’t a store you’ve vaulted from, Impulse Vault does nothing beyond a couple of
          checks — no reading, no network, nothing stored. It still never sends anything anywhere.
        </Note>
      ) : (
        <Note>
          Built in: {builtinDomains.join(', ')}.
        </Note>
      )}
    </Card>
  );
}
