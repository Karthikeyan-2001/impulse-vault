/** Export / import / delete-everything. Local only — there is no server to sync with. */
import { mergeSnapshots, parseImport, toExport, type ExportBlob } from '../lib/migrate';
import { repo } from '../lib/storage';
import { setupContextMenus } from './menus';
import { sync } from './sync';

export async function exportAll(): Promise<ExportBlob> {
  return toExport(await repo.snapshot(), Date.now());
}

export async function importAll(json: unknown, mode: 'merge' | 'replace'): Promise<{ items: number }> {
  const incoming = parseImport(json, Date.now());
  const next = mode === 'replace' ? incoming : mergeSnapshots(await repo.snapshot(), incoming);
  await repo.replaceAll(next);
  await sync();
  return { items: Object.keys(next.items).length };
}

/** The nuke button: storage, rules, alarms, notifications, badge. Nothing left anywhere. */
export async function nuke(): Promise<void> {
  await repo.clearAll();
  const [dynamic, session] = await Promise.all([
    chrome.declarativeNetRequest.getDynamicRules(),
    chrome.declarativeNetRequest.getSessionRules(),
  ]);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: dynamic.map((r) => r.id) });
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: session.map((r) => r.id) });
  await chrome.alarms.clearAll();
  const notes = await chrome.notifications.getAll();
  await Promise.all(Object.keys(notes).map((id) => chrome.notifications.clear(id)));
  await chrome.action.setBadgeText({ text: '' });
  await setupContextMenus();
  await sync();
}
