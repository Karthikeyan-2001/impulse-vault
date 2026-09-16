# Impulse Vault

A Chrome extension that puts a mandatory cooling-off period — 72 hours by default — between wanting something online and buying it, and turns every abandoned purchase into visible, accumulating **money saved**.

- **Friction at the moment of impulse.** The buy path is interrupted, not merely discouraged.
- **Deferral feels like action.** Vaulting is as satisfying as adding to cart: the card drops into a vault door and the lock turns.
- **Reward on the "no".** Declining pays out immediately — the price lands on your Saved Stack, and the stack never goes down.
- **Zero guilt on the "yes".** Buying after 72 hours is a success state. It means the system worked.

Everything is local: no accounts, no server, no sync, no analytics, no remote code, no affiliate links. That's a product promise, not an implementation detail.

---

## Install (unpacked)

```bash
corepack pnpm install
corepack pnpm build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the `dist/` folder.

> `pnpm` ships with Node via corepack. If you have pnpm installed globally, plain `pnpm install` / `pnpm build` work too.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Rebuilds on change (pages, worker, content scripts). Press the reload icon on `chrome://extensions` to pick up worker/content-script changes. |
| `pnpm build` | Typechecks, then builds `dist/`. |
| `pnpm zip` | Builds, then packs `dist/` into `impulse-vault-<version>.zip` for the Web Store. |
| `pnpm test` | Vitest suite (money, time, state machine, URLs, rules, packs, migrations, extraction). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm icons` | Regenerates `public/icons/*.png` from `scripts/make-icons.mjs`. |

---

## How it works

### The loop

1. **Vault it.** On a product page, a "Vault it — 72h" button sits next to Add to Cart. It opens a compact card: title, image and price (all editable — extraction is never perfect) plus one line, *"Why do you want this?"*. Confirming drops the card into a vault door on a spring, and the Add to Cart area is replaced by a locked countdown.
2. **Cooling.** The item's product page redirects to a soft gate; the site's cart and checkout are hard-blocked. Both happen at the network layer, before the page loads.
3. **Ripe.** When the timer expires the lock lifts, the price is re-checked, and a notification asks *"Do you still want this?"* with **Yes, buy it** and **No, save ₹X**. "No" completes from the notification in one click.
4. **Saved.** A decline adds the price to the Saved Stack for that currency, with a coin flying onto the pile and the total counting up. Nothing ever subtracts from it.

### The lock, honestly

You cannot reliably block "add to cart" across the open web. Sites are dynamic, buttons are re-rendered, and a determined user always wins. Impulse Vault aims for a **reliable speed bump that defeats autopilot**, in four layers:

| # | Layer | Strength | Mechanism |
| --- | --- | --- | --- |
| 1 | Product-page gate | Soft — one click to pass | `declarativeNetRequest` redirect on `main_frame` |
| 2 | Cart / checkout block | Hard — interstitial friction | Same mechanism, cart paths per domain |
| 3 | Click interception | Best effort | Capture-phase listeners in the content script |
| 4 | Form-submit guard | Best effort | Capture-phase `submit` listener |

Layer 1 is deliberately passable: revisiting a product page during the cooldown *is* deliberation — re-reading reviews, checking whether the price dropped — which is the entire point of a cooling-off period. Passing it grants that tab a 30-minute bypass. Layer 2 is where the friction lives, and the layer-1 bypass never applies to it.

Opting into **Lockdown** per item promotes layer 1 to hard: no "view anyway", just the interstitial's friction. It's never the default.

The escape hatch (**Unlock early**) is always available: type a sentence explaining why it can't wait (25 characters), then sit through a 20-second countdown. Early unlocks are counted and shown back to you in the popup with no shaming language. A tool that traps people gets uninstalled.

### Architecture

```
src/
  background/     service worker: alarms, sweep, notifications, DNR rules, badge, messages
  content/
    extractor/    product scraping: JSON-LD → microdata → site pack → OpenGraph → heuristics
    interceptor/  capture-phase click/submit guards, the page banner, the interstitial overlay
    vault-button/ the injected "Vault it" button, the inline card, the locked countdown
  pages/          gate, cart interstitial, and the vault window (context-menu captures)
  popup/          React: Cooling · Ripe · Saved, and the Saved Money Stack
  options/        React: settings, site packs, export/import, delete everything
  offscreen/      fetch + DOMParser, for re-checking prices (DOMParser is unavailable in a worker)
  lib/            storage repo, money, time, state machine, rules, copy, migrations
  ui/             framework-free widgets shared by content scripts and extension pages
  types/          data model and the typed message protocol
sites/*.json      site packs + their JSON Schema
```

Rules of the codebase:

- **`chrome.storage` is touched in exactly one module** (`lib/storage.ts`). UI code reads through the repo and asks the worker to change things via the typed message API (`lib/api.ts`), so there is a single writer and no read-modify-write races.
- **Pure logic is pure.** `money`, `time`, `state`, `rules`, `url`, `copy` and `migrate` take `now` as an argument and never touch `chrome.*`. That's what the tests cover.
- **DNR rules are a pure function of state** — `rules = f(items, packs, passes)` — and are rebuilt wholesale on every change and every worker start, so a stale rule can't survive a state transition.
- **`chrome.alarms` only.** The service worker is killed aggressively; nothing relies on a timer longer than a second. A 5-minute sweep is the real guarantee, per-item alarms are for punctuality.
- **Content scripts are plain TypeScript in closed shadow roots.** No framework, so the injected payload stays small, and page CSS can't bend our UI.

---

## Adding a site pack

A pack is a JSON file in `sites/`, validated by `sites/schema.json`. Nothing about a pack is required — without one, extraction falls back to JSON-LD, microdata, OpenGraph and heuristics, which works on most stores. A pack makes extraction and the lock sharper.

1. Copy an existing pack, e.g. `sites/croma.com.json`.
2. Fill in:
   - `domains` — bare registrable domains. `amazon.in` also matches `www.` and `m.`, never `notamazon.in`.
   - `productIdPattern` — a regex over pathname + search whose **group 1** is the stable product id. This drives dedupe, canonical URLs and the gate rule.
   - `gatePathPattern` — the product path with an `{id}` placeholder, e.g. `(?:dp|gp/product)/{id}`. The gate matches it anywhere in the path, so slugs, locale prefixes and tracking params don't defeat it.
   - `canonicalUrl` — only if a bare-id URL is known to resolve (verify it: it's what "Yes, buy it" opens and what the price re-check fetches). Otherwise use `keepParams` to say which query params identify the product (Flipkart's `pid`), or `[]` to drop them all.
   - `selectors` — `title`, `price`, `image`, `addToCart`, `buyNow`, `checkout`, `outOfStock`, `vaultAnchor`. First match with content wins.
   - `cartPaths` — regex fragments matched at the start of the path (after an optional locale prefix). These drive the hard checkout block. **Check they can't match a product URL**, or you'll block browsing the whole store.
3. Add a row to `tests/packs.test.ts` with a real product URL. The test asserts the id extracts, the canonical URL collapses variants, the gate matches every URL shape, and the cart regex never matches a product page.
4. `pnpm test`, then reload the extension.

Users can edit any pack, or add their own, in **Options → Supported sites** — same schema, validated in the browser. An edited pack overrides the built-in one of the same id; "Reset" drops back to the shipped version. When a pack's selectors stop matching, extraction silently falls back and Options shows a quiet *"pack may be outdated"* note.

Sites without a pack work too: vault from the toolbar popup or the right-click menu on any page or link. To lock such a site (not just track it), Impulse Vault asks for access to that origin — the card's "Lock this site too" checkbox.

---

## Permissions, and why each one is needed

| Permission | Why |
| --- | --- |
| `storage` | The vault, the Saved Stack and settings. Local only. |
| `alarms` | Cooling-off timers and the reconciliation sweep. A service worker can't hold a timer. |
| `notifications` | "Do you still want this?" when a timer ends, with the one-click decline. |
| `declarativeNetRequest` | The product gate and the cart/checkout block. Rules are evaluated by Chrome; the extension never sees your browsing. |
| `offscreen` | `DOMParser` doesn't exist in a service worker. Used to re-read a product page when its timer ends. |
| `scripting` | Injecting the content script on demand (popup, right-click) and registering it for sites you grant. |
| `activeTab` | Vaulting the page you're looking at, from the popup or the right-click menu, without permanent access to that site. |
| `contextMenus` | "Vault this page" / "Vault this link". |
| `host_permissions` (7 retailers) | Reading the product's title and price, placing the Vault button, and applying redirect rules on those stores. |
| `optional_host_permissions` | Requested per site, only when you ask to lock a store that isn't built in. Declining still lets you track the item. |

No `tabs` permission: the extension sees a tab's URL only for hosts you've already granted.

---

## Tests

`pnpm test` covers the pure core: price parsing (Indian lakh grouping, European separators, space-grouped Nordic, ranges, MRP-vs-sale, prices split across `<span>`s), cooldown and quiet-hours math, the state machine and Saved Stack arithmetic, URL canonicalisation, DNR rule generation, every shipped pack against real URLs, storage migrations, and the extraction strategies against fixture DOMs.

DOM glue and animations aren't unit-tested; `TESTING.md` is the manual pass, per retailer.
