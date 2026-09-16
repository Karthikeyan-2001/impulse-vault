/**
 * Money is always stored in minor units (paise, cents) as an integer, paired with an
 * ISO 4217 code. Never floats. Never invented exchange rates.
 */
export type Money = { amountMinor: number; currency: string };

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'PYG', 'XOF', 'XAF', 'IDR']);
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);

export function currencyDecimals(currency: string): number {
  if (ZERO_DECIMAL.has(currency)) return 0;
  if (THREE_DECIMAL.has(currency)) return 3;
  return 2;
}

export function isCurrencyCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code);
}

/** Symbols that map to more than one currency; the page/site hint breaks the tie. */
const FAMILIES: Record<string, string[]> = {
  $: ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN'],
  kr: ['SEK', 'NOK', 'DKK', 'ISK'],
  '¥': ['JPY', 'CNY'],
};

/** Longest-first so `US$` wins over `$` and `Rs.` over `Rs`. */
const SYMBOLS: Array<[string, string]> = [
  ['US$', 'USD'], ['CA$', 'CAD'], ['AU$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'],
  ['A$', 'AUD'], ['C$', 'CAD'], ['S$', 'SGD'], ['R$', 'BRL'],
  ['Rs.', 'INR'], ['Rs', 'INR'], ['₹', 'INR'],
  ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'], ['￥', 'JPY'], ['₩', 'KRW'], ['₽', 'RUB'],
  ['₺', 'TRY'], ['zł', 'PLN'], ['Kč', 'CZK'], ['฿', 'THB'], ['₫', 'VND'], ['₱', 'PHP'],
  ['kr.', 'DKK'], ['kr', 'SEK'], ['RM', 'MYR'], ['$', 'USD'],
];

const ISO_CODES = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SEK', 'NOK', 'DKK', 'CHF', 'AUD', 'CAD', 'NZD',
  'SGD', 'HKD', 'AED', 'SAR', 'ZAR', 'BRL', 'MXN', 'PLN', 'CZK', 'KRW', 'THB', 'MYR', 'IDR',
  'PHP', 'VND', 'TRY', 'RUB',
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CURRENCY_ALT = [
  ...ISO_CODES.map((c) => `${c}(?![A-Za-z])`),
  ...SYMBOLS.map(([s]) => (/^[A-Za-z]/.test(s) ? `${escapeRe(s)}(?![A-Za-z])` : escapeRe(s))),
].join('|');

const SP = String.raw`[    ]`;

// A number as it appears on a price label. Space groups must be exactly 3 digits so that
// "2 ₹1,299" or "4.5 out of 5" never fuse into one amount.
const NUM = String.raw`\d+(?:[.,]\d{2,3}(?!\d)|${SP}\d{3}(?!\d))*(?:[.,]\d{1,2})?(?!\d)`;

// Three shapes, tried left to right: "₹1,299" | "1 299 kr" | bare "1299".
// A trailing symbol only counts if it isn't the prefix of the *next* price ("20 ₹1,299").
const TOKEN_RE = new RegExp(
  String.raw`(?<pre>${CURRENCY_ALT})${SP}*(?<n1>${NUM})` +
    String.raw`|(?<n2>${NUM})${SP}*(?<post>${CURRENCY_ALT})(?!${SP}*\d)` +
    String.raw`|(?<n3>${NUM})`,
  'g',
);

function resolveSymbol(symbol: string, hint?: string): string | null {
  const trimmed = symbol.trim();
  if (ISO_CODES.includes(trimmed)) return trimmed;
  const family = FAMILIES[trimmed === 'kr.' ? 'kr' : trimmed];
  if (family && hint && family.includes(hint)) return hint;
  const hit = SYMBOLS.find(([s]) => s === trimmed);
  return hit ? hit[1] : null;
}

/**
 * Decide which separator is the decimal point. Pure string work, no floats.
 * "1,29,900" → group; "1,299.00" → '.' decimal; "1.299,00" → ',' decimal; "12,50" → decimal.
 */
export function splitNumber(raw: string, currency: string): { int: string; frac: string } | null {
  const s = raw.replace(/[    ]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const count = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
    if (count === 1 && digitsAfter !== 3 && currencyDecimals(currency) > 0) decimalSep = sep;
  }

  let int = s;
  let frac = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    int = s.slice(0, idx);
    frac = s.slice(idx + 1);
  }
  int = int.replace(/[.,]/g, '');
  if (!/^\d+$/.test(int) || !/^\d*$/.test(frac)) return null;
  return { int, frac };
}

function toMinor(int: string, frac: string, currency: string): number {
  const d = currencyDecimals(currency);
  const fracDigits = frac.slice(0, d).padEnd(d, '0');
  let minor = Number(int) * 10 ** d + (d > 0 ? Number(fracDigits) : 0);
  // Round half up on any extra precision (e.g. "1299.995").
  if (frac.length > d && Number(frac[d]) >= 5) minor += 1;
  return minor;
}

export interface ParseOptions {
  /** Used when the text has no symbol, and to disambiguate `$`, `kr`, `¥`. */
  currencyHint?: string;
  /** Treat bare numbers (no symbol) as prices in this currency — for user input fields. */
  allowBare?: boolean;
}

export interface PriceToken extends Money {
  index: number;
  raw: string;
}

const BEFORE_NOISE = /(save|saving|you save|off|discount|coupon|cashback|emi|extra|delivery|shipping|fee)\W{0,3}$/i;
const AFTER_NOISE = /^\W{0,2}(off|delivery|shipping|fee|charge|\/\s*(mo|month)|per\b|a month|monthly|cashback|%)/i;

/**
 * Normalise text lifted from a DOM where prices are split across spans:
 * "₹ 1,29,900 . 00" → "₹1,29,900.00". Space-grouped numbers ("1 299 kr") survive.
 */
export function normalizePriceText(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/(\d)[  ]*([.,])[  ]*(\d)/g, '$1$2$3')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Join the text of adjacent price fragments (e.g. Amazon's symbol/whole/decimal/fraction spans). */
export function joinPriceFragments(parts: string[]): string {
  return normalizePriceText(parts.map((p) => p.trim()).join(''));
}

/** Every plausible price in a snippet, skipping "save ₹700", "₹40 delivery", "35%". */
export function parseAllPrices(text: string, opts: ParseOptions = {}): PriceToken[] {
  const s = normalizePriceText(text);
  const out: PriceToken[] = [];
  for (const m of s.matchAll(TOKEN_RE)) {
    const g = m.groups ?? {};
    const num = g.n1 ?? g.n2 ?? g.n3;
    if (!num) continue;
    const symbol = g.pre ?? g.post;
    let currency: string | null = symbol ? resolveSymbol(symbol, opts.currencyHint) : null;
    if (!currency) {
      if (!opts.allowBare || !opts.currencyHint) continue;
      currency = opts.currencyHint;
    }
    const index = m.index ?? 0;
    const before = s.slice(Math.max(0, index - 18), index);
    const after = s.slice(index + m[0].length, index + m[0].length + 14);
    if (BEFORE_NOISE.test(before) || AFTER_NOISE.test(after)) continue;
    const parts = splitNumber(num, currency);
    if (!parts) continue;
    const amountMinor = toMinor(parts.int, parts.frac, currency);
    if (amountMinor <= 0) continue;
    out.push({ amountMinor, currency, index, raw: m[0].trim() });
  }
  return out;
}

/**
 * The price a shopper would actually pay, from a snippet of text.
 * Ranges take the low end; MRP-vs-sale pairs take the smaller adjacent price.
 */
export function parsePrice(text: string, opts: ParseOptions = {}): Money | null {
  const tokens = parseAllPrices(text, opts);
  if (tokens.length === 0) return null;
  // Only compare prices in the dominant currency of the snippet.
  const currency = tokens[0]!.currency;
  const same = tokens.filter((t) => t.currency === currency);
  const low = same.reduce((a, b) => (b.amountMinor < a.amountMinor ? b : a));
  return { amountMinor: low.amountMinor, currency };
}

/** Machine-formatted amounts from JSON-LD / meta tags: "1299.00", 1299, "1,299.00". */
export function parseAmount(value: unknown, currency: string): Money | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const d = currencyDecimals(currency);
    return { amountMinor: Math.round(value * 10 ** d), currency };
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const [int, frac = ''] = cleaned.split('.');
    const minor = toMinor(int!, frac, currency);
    return minor > 0 ? { amountMinor: minor, currency } : null;
  }
  return parsePrice(cleaned, { currencyHint: currency, allowBare: true });
}

/** Parse what a user typed into an editable price field. */
export function parseMoneyInput(text: string, currency: string): Money | null {
  const tokens = parseAllPrices(text, { currencyHint: currency, allowBare: true });
  const first = tokens[0];
  return first ? { amountMinor: first.amountMinor, currency: first.currency } : null;
}

function localeFor(currency: string, locale?: string): string | undefined {
  // Lakh/crore grouping for rupees regardless of browser locale: ₹1,29,900, not ₹129,900.
  if (currency === 'INR') return 'en-IN';
  return locale;
}

export interface FormatOptions {
  locale?: string;
  /** Keep ".00" even on whole amounts. Default drops it: "₹2,499". */
  alwaysShowFraction?: boolean;
}

export function formatMoney(m: Money, opts: FormatOptions = {}): string {
  const d = currencyDecimals(m.currency);
  const whole = m.amountMinor % 10 ** d === 0;
  const fractionDigits = whole && !opts.alwaysShowFraction ? 0 : d;
  try {
    return new Intl.NumberFormat(localeFor(m.currency, opts.locale), {
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(m.amountMinor / 10 ** d);
  } catch {
    return `${m.currency} ${(m.amountMinor / 10 ** d).toFixed(fractionDigits)}`;
  }
}

/**
 * Number without the symbol, for editable inputs: "26,990" / "1,299.50". Always '.' as the
 * decimal mark so parseMoneyInput reads it back unambiguously.
 */
export function formatAmountInput(m: Money): string {
  const d = currencyDecimals(m.currency);
  const whole = m.amountMinor % 10 ** d === 0;
  return new Intl.NumberFormat(m.currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: whole ? 0 : d,
    maximumFractionDigits: d,
  }).format(m.amountMinor / 10 ** d);
}

export function currencySymbol(currency: string, locale?: string): string {
  try {
    const parts = new Intl.NumberFormat(localeFor(currency, locale), {
      style: 'currency',
      currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/** b − a in minor units, or null when currencies differ (we never convert). */
export function moneyDelta(a: Money, b: Money): number | null {
  return a.currency === b.currency ? b.amountMinor - a.amountMinor : null;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function fromMajor(amount: number, currency: string): Money {
  return { amountMinor: Math.round(amount * 10 ** currencyDecimals(currency)), currency };
}

export function toMajor(m: Money): number {
  return m.amountMinor / 10 ** currencyDecimals(m.currency);
}
