/** Export / import / delete everything. No account, no server, no sync — this is all of it. */
import { useRef, useState } from 'react';
import { call } from '../lib/api';
import { toExport } from '../lib/migrate';
import { repo } from '../lib/storage';
import { Button, Card, Note, Row } from './fields';

export function Data() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const blob = new Blob([JSON.stringify(toExport(await repo.snapshot(), Date.now()), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impulse-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus('Exported. It’s a plain JSON file — yours to keep.');
    setError(null);
  };

  const doImport = async (file: File) => {
    setStatus(null);
    setError(null);
    try {
      const json = JSON.parse(await file.text());
      const res = await call('data/import', { json, mode });
      setStatus(`Imported. ${res.items} item${res.items === 1 ? '' : 's'} in the vault.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be imported.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card title="Your data" subtitle="Everything lives in this browser profile. There is no account, no server and no sync — nothing to leak on a shared machine.">
      <Row label="Export" hint="Every item, your Saved Stack and settings, as JSON.">
        <Button onClick={() => void doExport()}>Export JSON</Button>
      </Row>
      <Row label="Import" hint="Merge keeps what you have and adds the file's items. Replace swaps everything.">
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-brass"
            value={mode}
            onChange={(e) => setMode(e.currentTarget.value as 'merge' | 'replace')}
            aria-label="Import mode"
          >
            <option value="merge">Merge</option>
            <option value="replace">Replace</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void doImport(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()}>Choose file…</Button>
        </div>
      </Row>
      {status ? <Note tone="mint">{status}</Note> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
    </Card>
  );
}

export function DangerZone() {
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  return (
    <Card
      tone="danger"
      title="Delete everything"
      subtitle="Every vaulted item, your whole Saved Stack and all settings. This can’t be undone, and there is no cloud copy. Export first if you want a record."
    >
      {done ? (
        <Note tone="mint">Gone. Empty vault, empty stack.</Note>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="confirm-delete" className="text-[13px] text-muted">
            Type <b className="text-text">DELETE</b> to confirm:
          </label>
          <input
            id="confirm-delete"
            className="h-9 w-32 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-danger"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            autoComplete="off"
          />
          <Button
            tone="danger"
            disabled={typed !== 'DELETE'}
            onClick={() => {
              void call('data/nuke', {}).then(() => {
                setDone(true);
                setTyped('');
              });
            }}
          >
            Delete everything
          </Button>
        </div>
      )}
    </Card>
  );
}
