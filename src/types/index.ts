import type { Money } from '../lib/money';
import type { QuietHours } from '../lib/time';

export type { Money } from '../lib/money';

export type VaultState =
  | 'cooling' // timer running
  | 'ripe' // timer expired, awaiting verdict
  | 'released' // user said yes — purchase unblocked
  | 'declined' // user said no — money moved to the Stack
  | 'expired'; // ripe and ignored for N days — auto-declined, softly

export type Confidence = 'high' | 'medium' | 'low';

export interface VaultItem {
  id: string;
  /** Canonical product URL (tracking params stripped). */
  url: string;
  domain: string;
  title: string;
  imageUrl?: string;
  priceAtVault: Money;
  /** Re-scraped when the timer expires. */
  priceAtRipen?: Money;
  /** Best-effort refresh (gate page, popup). */
  currentPrice?: Money;
  state: VaultState;
  vaultedAt: number;
  /** The only timer truth. */
  unlockAt: number;
  decidedAt?: number;
  /** "Why do you want this?", captured at vault time. */
  note?: string;
  extractionConfidence: Confidence;

  // ── Beyond the core spec ───────────────────────────────────────────────
  cooldownHours: number;
  /** Stable retailer ID (ASIN, Flipkart itm…, etc.) — what DNR rules match on. */
  productId?: string;
  packId?: string;
  /** Promotes the product-page gate from soft (one click) to hard (interstitial friction). */
  lockdown: boolean;
  /** False when the extension has no host access to this site — the item is tracked, not locked. */
  lockEnabled: boolean;
  notifiedAt?: number;
  /** Set once the ripen-time price check ran (success or not), so it runs once. */
  priceCheckedAt?: number;
  soldOut?: boolean;
  earlyUnlock?: { at: number; reason: string };
}

export interface StackEntry {
  itemId: string;
  amountMinor: number;
  at: number;
  /** True when an ignored ripe item was auto-declined. */
  auto?: boolean;
}

export interface SavedStack {
  totalMinor: number;
  currency: string;
  declineCount: number;
  history: StackEntry[];
}

/** One stack per currency. We never convert between them. */
export type Stacks = Record<string, SavedStack>;

export interface Milestone {
  amountMinor: number;
  /** User-written only, e.g. "≈ 2 months of groceries". We never invent one. */
  equivalence?: string;
}

export interface Settings {
  defaultCooldownHours: number;
  /** The currency milestones and the headline total are shown in. */
  displayCurrency: string;
  expiryDays: number;
  bypassMinutes: number;
  unlockMinChars: number;
  unlockWaitSeconds: number;
  lockSound: boolean;
  notifications: {
    enabled: boolean;
    quietHours: QuietHours;
  };
  milestones: Milestone[];
  incognitoPromptDismissed: boolean;
  welcomeDismissed: boolean;
}

export interface Meta {
  schemaVersion: number;
  /** currency → milestone thresholds already celebrated. */
  celebrated: Record<string, number[]>;
  /** A milestone crossed but not yet shown in the popup. */
  pendingCelebration?: { currency: string; amountMinor: number };
}

export interface SitePackSelectors {
  title?: string[];
  price?: string[];
  image?: string[];
  addToCart?: string[];
  buyNow?: string[];
  checkout?: string[];
  outOfStock?: string[];
  /** Where the Vault button goes; defaults to addToCart. */
  vaultAnchor?: string[];
}

export interface SitePack {
  id: string;
  name: string;
  /** Registrable domains, e.g. "amazon.in". Subdomains (www., m.) match. */
  domains: string[];
  currency?: string;
  /** Regex run against pathname+search; capture group 1 is the product ID. */
  productIdPattern?: string;
  /** Regex fragment for the product path with `{id}` placeholder, used for DNR gate rules. */
  gatePathPattern?: string;
  /** Canonical product URL template with `{id}`. Only for stores where a bare-ID URL is known to work. */
  canonicalUrl?: string;
  /** Without a template: keep only these query params (e.g. Flipkart's `pid` variant). [] drops all. */
  keepParams?: string[];
  selectors: SitePackSelectors;
  /** Regex fragments for cart/checkout paths (matched right after the host). */
  cartPaths?: string[];
  /** Lowercase phrases that mean "sold out" on this site. */
  outOfStockText?: string[];
}

export interface PackHealth {
  lastHit?: number;
  lastMiss?: number;
}

export interface Extraction {
  url: string;
  canonicalUrl: string;
  domain: string;
  title?: string;
  imageUrl?: string;
  price?: Money;
  confidence: Confidence;
  source: 'json-ld' | 'microdata' | 'meta' | 'pack' | 'heuristic' | 'none';
  inStock?: boolean;
  productId?: string;
  packId?: string;
  isProductPage: boolean;
}

/** What the vault card submits. */
export interface VaultDraft {
  url: string;
  title: string;
  imageUrl?: string;
  price: Money;
  note?: string;
  cooldownHours: number;
  lockdown: boolean;
  confidence: Confidence;
  productId?: string;
  packId?: string;
}

export interface Bypass {
  tabId: number;
  itemId: string;
  expiresAt: number;
}

export interface CartPass {
  tabId: number;
  domain: string;
  expiresAt: number;
}
