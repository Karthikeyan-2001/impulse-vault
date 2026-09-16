/** Talking to pages: injecting the content script on demand and asking it to extract. */
import { originPattern, parseUrl } from '../lib/url';
import type { Extraction, SitePack } from '../types';
import type { ContentMessage } from '../types/messages';

export async function hasHostAccess(url: string): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin) return false;
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

async function sendToTab<T>(tabId: number, msg: ContentMessage): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T;
  } catch {
    return undefined;
  }
}

/** Make sure our content script is running in the tab (static match, dynamic registration, or activeTab). */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  if (await sendToTab<boolean>(tabId, { type: 'content/ping' })) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['main-world.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    return false; // chrome:// pages, the Web Store, PDFs, or no access
  }
  return !!(await sendToTab<boolean>(tabId, { type: 'content/ping' }));
}

export async function extractFromTab(tabId: number, pack?: SitePack): Promise<Extraction | null> {
  if (!(await ensureContentScript(tabId))) return null;
  return (await sendToTab<Extraction>(tabId, { type: 'content/extract', pack })) ?? null;
}

export async function openVaultCardInTab(tabId: number): Promise<boolean> {
  if (!(await ensureContentScript(tabId))) return false;
  return !!(await sendToTab<boolean>(tabId, { type: 'content/openVaultCard' }));
}

export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export function isWebUrl(url: string | undefined): url is string {
  return !!url && !!parseUrl(url);
}
