/** Context menus: vault any page or link, including on sites without a site pack. */
import { repo } from '../lib/storage';
import { presetLabel } from '../lib/time';
import { hasHostAccess, openVaultCardInTab } from './tabs';

const PAGE = 'iv-vault-page';
const LINK = 'iv-vault-link';

let chain: Promise<void> = Promise.resolve();

/** Serialised: install and settings changes can overlap, and duplicate ids would error. */
export function setupContextMenus(): Promise<void> {
  chain = chain.then(buildMenus, buildMenus);
  return chain;
}

async function buildMenus(): Promise<void> {
  const { defaultCooldownHours } = await repo.getSettings();
  const label = presetLabel(defaultCooldownHours);
  await chrome.contextMenus.removeAll();
  const swallow = () => void chrome.runtime.lastError;
  chrome.contextMenus.create({ id: PAGE, title: `Vault this page — ${label}`, contexts: ['page'] }, swallow);
  chrome.contextMenus.create({ id: LINK, title: `Vault this link — ${label}`, contexts: ['link'] }, swallow);
}

export function onContextMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
  if (info.menuItemId === PAGE && tab?.id !== undefined && info.pageUrl) {
    const tabId = tab.id;
    const pageUrl = info.pageUrl;
    void (async () => {
      // Sites we can lock get the inline card. Elsewhere, the vault window can ask for access
      // (content scripts can't), extracting from the tab via the activeTab grant this click gave us.
      if ((await hasHostAccess(pageUrl)) && (await openVaultCardInTab(tabId))) return;
      await openVaultWindow(pageUrl, tabId);
    })();
  } else if (info.menuItemId === LINK && info.linkUrl) {
    void openVaultWindow(info.linkUrl);
  }
}

export async function openVaultWindow(url: string, tabId?: number): Promise<void> {
  const q = new URLSearchParams({ url });
  if (tabId !== undefined) q.set('tabId', String(tabId));
  await chrome.windows.create({
    url: chrome.runtime.getURL(`pages/vault/index.html?${q}`),
    type: 'popup',
    width: 440,
    height: 680,
  });
}
