import type { Extraction, Settings, SitePack, VaultDraft, VaultItem } from './index';

/** What the content script needs to render a page. */
export interface PageContext {
  pack?: SitePack;
  /** Fingerprint packs (Shopify, WooCommerce...), used when no domain pack matches. */
  platformPacks: SitePack[];
  /** An active (cooling/ripe) item for the product on this page. */
  item?: VaultItem;
  /** Released in the last few minutes (for the "Go get it" line). */
  released?: VaultItem;
  /** All cooling items on this domain (drives checkout-button interception). */
  coolingOnDomain: VaultItem[];
  /** This tab holds a cart pass for this domain ("something else in my cart"). */
  cartPass: boolean;
  settings: Pick<Settings, 'defaultCooldownHours' | 'unlockMinChars' | 'unlockWaitSeconds' | 'lockSound'>;
  now: number;
}

export interface TabExtraction {
  tabId: number;
  url: string | null;
  extraction: Extraction | null;
  /** We can lock this site (built-in pack or granted host permission). */
  hasAccess: boolean;
  /** Origin match pattern to request if not, e.g. "https://shop.example.com/*". */
  origin: string | null;
  defaultCooldownHours: number;
  displayCurrency: string;
  lockSound: boolean;
}

export type CreateResult =
  | { status: 'created'; item: VaultItem }
  | { status: 'duplicate'; item: VaultItem };

/** Requests to the service worker. `R` is the response type. */
export interface Api {
  'vault/create': { req: { draft: VaultDraft }; res: CreateResult };
  'vault/decline': { req: { id: string }; res: { item: VaultItem; totalMinor: number; declineCount: number } };
  'vault/release': { req: { id: string }; res: VaultItem };
  'vault/unlockEarly': { req: { id: string; reason: string }; res: VaultItem };
  'vault/remove': { req: { id: string }; res: void };
  'vault/refreshPrice': { req: { id: string }; res: VaultItem | undefined };
  'vault/open': { req: { id: string }; res: void };
  'page/context': { req: { url: string }; res: PageContext };
  /** Extract from a tab (default: the active one). Works via activeTab on any site. */
  'page/extractTab': { req: { tabId?: number }; res: TabExtraction };
  'page/packHealth': { req: { packId: string; hit: boolean }; res: void };
  'gate/pass': { req: { id: string; url: string; tabId: number }; res: void };
  'cart/pass': { req: { domain: string; url: string; tabId: number }; res: void };
  'scrape/url': { req: { url: string }; res: Extraction | null };
  'site/enable': { req: { origin: string }; res: void };
  'settings/update': { req: { patch: Partial<Settings> }; res: Settings };
  'packs/set': { req: { packs: Record<string, SitePack> }; res: void };
  'data/import': { req: { json: unknown; mode: 'merge' | 'replace' }; res: { items: number } };
  'data/nuke': { req: Record<string, never>; res: void };
  'meta/ackCelebration': { req: Record<string, never>; res: void };
}

export type ApiType = keyof Api;
export type ApiRequest<T extends ApiType = ApiType> = { type: T } & Api[T]['req'];
export type ApiResponse<T extends ApiType> = { ok: true; data: Api[T]['res'] } | { ok: false; error: string };

/** Worker → content script. */
export type ContentMessage =
  | { type: 'content/ping' }
  | { type: 'content/extract'; pack?: SitePack }
  | { type: 'content/openVaultCard' };

/** Worker → offscreen document. */
export interface OffscreenScrape {
  target: 'offscreen';
  type: 'scrape';
  url: string;
  pack?: SitePack;
}
