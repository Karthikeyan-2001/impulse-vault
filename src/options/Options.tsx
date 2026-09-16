import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import { formatMoney, fromMajor, isCurrencyCode, parseMoneyInput, toMajor } from '../lib/money';
import { repo } from '../lib/storage';
import type { Milestone, PackHealth, Settings, SitePack } from '../types';
import { useVaultState } from '../ui/react/hooks';
import { Data, DangerZone } from './Data';
import { Sites } from './Sites';
import { Badge, Button, Card, NumberField, Note, Row, Select, TextField, Toggle } from './fields';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'SEK'];

export function Options() {
  const state = useVaultState();
  const [packs, setPacks] = useState<Record<string, SitePack>>({});
  const [health, setHealth] = useState<Record<string, PackHealth>>({});
  const [incognito, setIncognito] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () => {
      void repo.getPackOverrides().then(setPacks);
      void repo.getPackHealth().then(setHealth);
    };
    load();
    const off = repo.onChange(['vault:packs', 'vault:packHealth'], load);
    chrome.extension.isAllowedIncognitoAccess().then(setIncognito, () => setIncognito(null));
    return off;
  }, []);

  if (!state) return <main className="mx-auto max-w-3xl px-6 py-10" />;
  const { settings } = state;
  const save = (patch: Partial<Settings>) => void call('settings/update', { patch });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center gap-3">
        <img src={chrome.runtime.getURL('icons/icon-48.png')} alt="" width={36} height={36} />
        <div>
          <h1 className="m-0 text-[22px] font-bold tracking-tight">Impulse Vault</h1>
          <p className="m-0 text-[13px] text-muted">
            72 hours between wanting and buying. Everything stays in this browser — no account, no server, no analytics.
          </p>
        </div>
      </header>

      {!settings.welcomeDismissed ? (
        <Card title="How it works">
          <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-[13.5px] leading-relaxed">
            <li>On a product page, hit <b>Vault it</b> next to Add to Cart — and write one line about why you want it.</li>
            <li>The buy button locks for {settings.defaultCooldownHours} hours. Revisiting the page is fine; the cart isn’t.</li>
            <li>When the timer ends you decide. Say no and its price lands on your Saved Stack, for good.</li>
          </ol>
          <Note>Buying it after the wait is a success, not a failure — it means the system worked.</Note>
          <div className="mt-3">
            <Button onClick={() => save({ welcomeDismissed: true })}>Got it</Button>
          </div>
        </Card>
      ) : null}

      {incognito === false && !settings.incognitoPromptDismissed ? (
        <Card tone="warn" title="Incognito windows aren’t covered">
          <p className="m-0 text-[13.5px] leading-relaxed">
            Impulse Vault isn’t allowed in incognito, so none of the locks apply there — one keyboard shortcut and the cooling-off
            period is gone. If that’s a gap you’d rather close, turn on “Allow in Incognito” on the extension’s details page.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })}>Open extension settings</Button>
            <Button tone="link" onClick={() => save({ incognitoPromptDismissed: true })}>
              Don’t mention it again
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title="Cooling off">
        <Row label="Default cooling-off period" hint="You can still pick a different one for each item when you vault it." htmlFor="cooldown">
          <Select
            id="cooldown"
            value={String(settings.defaultCooldownHours)}
            onChange={(v) => save({ defaultCooldownHours: Number(v) })}
            options={[
              { value: '24', label: '24 hours' },
              { value: '72', label: '72 hours' },
              { value: '168', label: '7 days' },
            ]}
          />
        </Row>
        <Row label="Auto-decline after" hint="A ripe item you never answer is softly let go, and still counts toward the stack." htmlFor="expiry">
          <NumberField id="expiry" value={settings.expiryDays} min={1} max={365} suffix="days" onChange={(expiryDays) => save({ expiryDays })} />
        </Row>
        <Row label="“View anyway” pass lasts" hint="After passing the gate, that tab can browse the product page this long. Checkout stays locked." htmlFor="bypass">
          <NumberField id="bypass" value={settings.bypassMinutes} min={1} max={240} suffix="minutes" onChange={(bypassMinutes) => save({ bypassMinutes })} />
        </Row>
        <Row label="Early unlock: reason length" hint="How much you have to write to explain why it can’t wait." htmlFor="chars">
          <NumberField id="chars" value={settings.unlockMinChars} min={0} max={300} suffix="characters" onChange={(unlockMinChars) => save({ unlockMinChars })} />
        </Row>
        <Row label="Early unlock: pause" hint="The countdown before the confirm button wakes up." htmlFor="wait">
          <NumberField id="wait" value={settings.unlockWaitSeconds} min={0} max={120} suffix="seconds" onChange={(unlockWaitSeconds) => save({ unlockWaitSeconds })} />
        </Row>
      </Card>

      <Money settings={settings} save={save} />

      <Card title="Notifications">
        <Row label="Tell me when a timer ends" hint="One notification per item, or a single summary if several ripen at once.">
          <Toggle
            label="Notifications"
            checked={settings.notifications.enabled}
            onChange={(enabled) => save({ notifications: { ...settings.notifications, enabled } })}
          />
        </Row>
        <Row label="Quiet hours" hint="Nothing lands during these hours; it waits until they’re over.">
          <div className="flex items-center gap-2">
            <Toggle
              label="Quiet hours"
              checked={settings.notifications.quietHours.enabled}
              onChange={(enabled) => save({ notifications: { ...settings.notifications, quietHours: { ...settings.notifications.quietHours, enabled } } })}
            />
            <input
              type="time"
              aria-label="Quiet hours start"
              className="h-9 rounded-[10px] border border-line bg-surface px-2 text-[13px] tabular outline-none focus:border-brass"
              value={settings.notifications.quietHours.start}
              onChange={(e) => save({ notifications: { ...settings.notifications, quietHours: { ...settings.notifications.quietHours, start: e.currentTarget.value } } })}
            />
            <span className="text-[12.5px] text-muted">to</span>
            <input
              type="time"
              aria-label="Quiet hours end"
              className="h-9 rounded-[10px] border border-line bg-surface px-2 text-[13px] tabular outline-none focus:border-brass"
              value={settings.notifications.quietHours.end}
              onChange={(e) => save({ notifications: { ...settings.notifications, quietHours: { ...settings.notifications.quietHours, end: e.currentTarget.value } } })}
            />
          </div>
        </Row>
        <Row label="Lock sound" hint="A short clunk when something goes in the vault, and a clink when a coin lands. Off by default.">
          <Toggle label="Lock sound" checked={settings.lockSound} onChange={(lockSound) => save({ lockSound })} />
        </Row>
      </Card>

      <Sites overrides={packs} health={health} />
      <Data />
      <DangerZone />

      <footer className="mb-10 mt-6 text-center text-[12px] text-muted">
        <p className="m-0">
          Impulse Vault {chrome.runtime.getManifest().version} · no accounts, no cloud sync, no analytics, no affiliate links.
        </p>
      </footer>
    </main>
  );
}

function Money({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => void }) {
  const currency = settings.displayCurrency;
  const [custom, setCustom] = useState('');
  const milestones = [...settings.milestones].sort((a, b) => a.amountMinor - b.amountMinor);

  const update = (next: Milestone[]) => save({ milestones: next.sort((a, b) => a.amountMinor - b.amountMinor) });

  return (
    <Card
      title="Money"
      subtitle="Prices are stored in whatever currency the store used — we never invent exchange rates. Stacks in other currencies are shown separately."
    >
      <Row label="Display currency" hint="The headline total and the milestones below use this one." htmlFor="currency">
        <div className="flex items-center gap-2">
          <Select
            id="currency"
            value={CURRENCIES.includes(currency) ? currency : '__other__'}
            onChange={(v) => v !== '__other__' && save({ displayCurrency: v })}
            options={[...CURRENCIES.map((c) => ({ value: c, label: c })), { value: '__other__', label: 'Other…' }]}
          />
          {!CURRENCIES.includes(currency) ? <Badge tone="brass">{currency}</Badge> : null}
          <TextField width="w-20" value={custom} placeholder="ISO" maxLength={3} onChange={(v) => setCustom(v.toUpperCase())} />
          <Button
            disabled={!isCurrencyCode(custom)}
            onClick={() => {
              save({ displayCurrency: custom });
              setCustom('');
            }}
          >
            Set
          </Button>
        </div>
      </Row>

      <div className="border-b border-line py-3 last:border-b-0">
        <div className="text-[13.5px] font-semibold">Milestones</div>
        <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-muted">
          Each one gets a one-time celebration. The “that’s roughly…” line is yours to write — we won’t invent one for you.
        </p>
        <div className="mt-3 grid gap-2">
          {milestones.map((m, i) => (
            <div key={`${m.amountMinor}-${i}`} className="flex flex-wrap items-center gap-2">
              <input
                className="h-9 w-32 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] tabular outline-none focus:border-brass"
                defaultValue={String(toMajor({ amountMinor: m.amountMinor, currency }))}
                aria-label={`Milestone amount in ${currency}`}
                onBlur={(e) => {
                  const parsed = parseMoneyInput(e.currentTarget.value, currency);
                  if (!parsed || parsed.amountMinor <= 0) return;
                  update(milestones.map((x, j) => (j === i ? { ...x, amountMinor: parsed.amountMinor } : x)));
                }}
              />
              <span className="text-[12.5px] text-muted tabular">{formatMoney({ amountMinor: m.amountMinor, currency })}</span>
              <input
                className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-brass"
                placeholder="≈ two months of groceries (optional, in your words)"
                defaultValue={m.equivalence ?? ''}
                maxLength={80}
                aria-label="What this is roughly worth to you"
                onBlur={(e) => update(milestones.map((x, j) => (j === i ? { ...x, equivalence: e.currentTarget.value.trim() || undefined } : x)))}
              />
              <Button tone="link" onClick={() => update(milestones.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Button
            onClick={() => {
              const last = milestones[milestones.length - 1];
              const next = last ? last.amountMinor * 2 : fromMajor(5000, currency).amountMinor;
              update([...milestones, { amountMinor: next }]);
            }}
          >
            Add milestone
          </Button>
        </div>
      </div>
    </Card>
  );
}
