/**
 * Service worker entry. Every listener is registered synchronously at the top level: MV3 kills
 * this worker aggressively, and events that wake it are only delivered to listeners that exist
 * on the first turn of the event loop.
 */
import { repo } from '../lib/storage';
import { listen, registerHandlers } from './messages';
import { importAll, nuke } from './data';
import { onContextMenuClick, setupContextMenus } from './menus';
import { showMilestone, showPayout, wireNotifications } from './notify';
import { scrapeUrl } from './offscreen';
import { packFor } from './packs';
import { applyRules, checkTab, dropTab, passCart, passGate } from './rules';
import { onPermissionsChanged, syncDynamicContentScripts } from './sites';
import { hasHostAccess } from './tabs';
import { runSweep } from './sweep';
import { onSync, sync } from './sync';
import { decline, refreshPrice, release, unlockEarly } from './vault';

listen();
onSync(applyRules);

registerHandlers({
  'gate/pass': ({ id, url, tabId }) => passGate(tabId, id, url),
  'cart/pass': ({ domain, url, tabId }) => passCart(tabId, domain, url),
  'vault/decline': async ({ id }) => {
    const { item, totalMinor, declineCount } = await declineWithFanfare(id);
    return { item, totalMinor, declineCount };
  },
  'vault/release': ({ id }) => release(id),
  'vault/unlockEarly': ({ id, reason }) => unlockEarly(id, reason),
  'vault/refreshPrice': ({ id }) => refreshPrice(id),
  'scrape/url': async ({ url }) => ((await hasHostAccess(url)) ? scrapeUrl(url, await packFor(url)) : null),
  'vault/open': async ({ id }) => {
    const item = await repo.getItem(id);
    if (item) await chrome.tabs.create({ url: item.url });
  },
  'settings/update': ({ patch }) => repo.updateSettings(patch),
  'packs/set': async ({ packs }) => {
    await repo.setPackOverrides(packs);
    await sync();
  },
  'data/import': ({ json, mode }) => importAll(json, mode),
  'data/nuke': () => nuke(),
  'meta/ackCelebration': async () => {
    await repo.updateMeta((m) => ({ ...m, pendingCelebration: undefined }));
  },
});

/** Decline + the milestone notification when one was crossed. */
async function declineWithFanfare(id: string, fromNotification = false) {
  const res = await decline(id);
  const { milestones, displayCurrency } = await repo.getSettings();
  if (res.milestones.length) {
    const top = res.milestones[res.milestones.length - 1]!;
    await showMilestone(top, displayCurrency, milestones.find((m) => m.amountMinor === top)?.equivalence);
  } else if (fromNotification) {
    await showPayout(res.item, res.totalMinor);
  }
  return res;
}

export async function openReview(): Promise<void> {
  const url = chrome.runtime.getURL('popup/index.html#ripe');
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.windows.create({ url, type: 'popup', width: 400, height: 620 });
  }
}

wireNotifications({
  release: async (id) => {
    const item = await release(id);
    await chrome.tabs.create({ url: item.url });
  },
  decline: async (id) => {
    await declineWithFanfare(id, true);
  },
  openItem: async (id) => {
    const item = await repo.getItem(id);
    if (item) await chrome.tabs.create({ url: item.url });
  },
  review: openReview,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('vault:')) void init().then(runSweep);
});

chrome.tabs.onRemoved.addListener((tabId) => void dropTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  // SPA route changes report a new URL on an already-complete tab; full loads report 'complete'.
  const url = change.url && tab.status === 'complete' ? change.url : change.status === 'complete' ? tab.url : undefined;
  if (url) void checkTab(tabId, url);
});

chrome.contextMenus.onClicked.addListener(onContextMenuClick);
chrome.permissions.onAdded.addListener(() => void onPermissionsChanged());
chrome.permissions.onRemoved.addListener(() => void onPermissionsChanged());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await setupContextMenus();
  if (reason === 'install') await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  void init();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'vault:settings' in changes) void setupContextMenus();
});

let initialised: Promise<void> | null = null;
/** Runs on every worker start: migrate storage, then sweep (which rebuilds all derived state). */
export function init(): Promise<void> {
  initialised ??= (async () => {
    await repo.migrateInPlace();
    await syncDynamicContentScripts();
    await sync();
  })().catch((err) => {
    initialised = null;
    console.error('[impulse-vault] init failed', err);
  });
  return initialised;
}

void init().then(runSweep);
