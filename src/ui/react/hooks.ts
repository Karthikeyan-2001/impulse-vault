import { useEffect, useState } from 'react';
import { KEYS, repo } from '../../lib/storage';
import type { Meta, Settings, Stacks, VaultItem } from '../../types';

export interface VaultState {
  items: Record<string, VaultItem>;
  stacks: Stacks;
  settings: Settings;
  meta: Meta;
}

/** Live view of storage: one read on mount, re-read whenever the worker writes. */
export function useVaultState(): VaultState | null {
  const [state, setState] = useState<VaultState | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => repo.getPopupState().then((s) => alive && setState(s));
    void load();
    const off = repo.onChange([KEYS.items, KEYS.stack, KEYS.settings, KEYS.meta], load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}

/** A clock that ticks every `ms` while mounted (countdowns). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
