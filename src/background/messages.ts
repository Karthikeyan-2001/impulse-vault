/** One router for every request to the worker. Handlers return data or throw a readable Error. */
import { repo } from '../lib/storage';
import { originPattern } from '../lib/url';
import type { Api, ApiRequest, ApiType } from '../types/messages';
import { pageContext } from './context';
import { packFor } from './packs';
import { onPermissionsChanged } from './sites';
import { activeTab, extractFromTab, hasHostAccess, isWebUrl } from './tabs';
import { createFromDraft, removeItem } from './vault';

type Handler<T extends ApiType> = (req: Api[T]['req'], sender: chrome.runtime.MessageSender) => Promise<Api[T]['res']>;
type Handlers = { [T in ApiType]?: Handler<T> };

const handlers: Handlers = {
  'vault/create': ({ draft }) => createFromDraft(draft),
  'vault/remove': ({ id }) => removeItem(id),

  'page/context': ({ url }, sender) => pageContext(url, sender.tab?.id),

  'page/extractTab': async ({ tabId }) => {
    const tab = tabId !== undefined ? await chrome.tabs.get(tabId).catch(() => undefined) : await activeTab();
    const settings = await repo.getSettings();
    const base = {
      tabId: tab?.id ?? -1,
      url: tab?.url ?? null,
      defaultCooldownHours: settings.defaultCooldownHours,
      displayCurrency: settings.displayCurrency,
      lockSound: settings.lockSound,
    };
    if (!tab?.id || !isWebUrl(tab.url)) return { ...base, extraction: null, hasAccess: false, origin: null };
    const extraction = await extractFromTab(tab.id, await packFor(tab.url));
    return { ...base, extraction, hasAccess: await hasHostAccess(tab.url), origin: originPattern(tab.url) };
  },

  'page/packHealth': ({ packId, hit }) => repo.updatePackHealth(packId, hit, Date.now()),

  'site/enable': () => onPermissionsChanged(),
};

/** Register more handlers from feature modules (keeps this file from importing everything). */
export function registerHandlers(more: Handlers): void {
  Object.assign(handlers, more);
}

export function listen(): void {
  chrome.runtime.onMessage.addListener((msg: ApiRequest & { target?: string }, sender, sendResponse) => {
    if (msg?.target === 'offscreen') return false; // for the offscreen document, not us
    const handler = handlers[msg?.type as ApiType] as Handler<ApiType> | undefined;
    if (!handler) return false;
    const { type: _type, ...req } = msg;
    handler(req as never, sender).then(
      (data) => sendResponse({ ok: true, data }),
      (err: unknown) => {
        // Most of these are user-facing refusals ("past the undo window"), not faults: keep them out of the error log.
        console.debug(`[impulse-vault] ${msg.type} refused:`, err);
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      },
    );
    return true; // async response
  });
}
