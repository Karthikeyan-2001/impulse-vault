import type { Meta, Settings } from '../types';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  defaultCooldownHours: 72,
  displayCurrency: 'INR',
  expiryDays: 14,
  bypassMinutes: 30,
  unlockMinChars: 25,
  unlockWaitSeconds: 20,
  lockSound: false,
  notifications: {
    enabled: true,
    quietHours: { enabled: false, start: '22:00', end: '08:00' },
  },
  // ₹5,000 / ₹10,000 / ₹25,000 / ₹50,000 / ₹1,00,000 in paise. No equivalences: those are the user's to write.
  milestones: [5_000, 10_000, 25_000, 50_000, 1_00_000].map((r) => ({ amountMinor: r * 100 })),
  incognitoPromptDismissed: false,
  welcomeDismissed: false,
};

export const DEFAULT_META: Meta = {
  schemaVersion: SCHEMA_VERSION,
  celebrated: {},
};

/** Stored settings may be from an older version: fill any gaps from defaults. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...s.notifications,
      quietHours: { ...DEFAULT_SETTINGS.notifications.quietHours, ...s.notifications?.quietHours },
    },
    milestones: Array.isArray(s.milestones) ? s.milestones : DEFAULT_SETTINGS.milestones,
  };
}
