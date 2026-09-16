# Manual QA checklist

`pnpm test` covers the pure logic. This is the pass for everything that touches a real browser and real stores.

Setup: `pnpm build`, load `dist/` unpacked at `chrome://extensions`, open the service worker console and keep it visible — **any red line is a failure**.

Automation note: the e2e harness used during development drives a Chrome-for-Testing profile with the extension loaded. Ajio and Croma serve bot-mitigation pages (Croma returns a decoy `image/jpeg`) to automated browsers, so those two must be checked by hand in a normal Chrome window.

---

## A. Per-retailer pass

Run for each: **amazon.in, amazon.com, flipkart.com, myntra.com, ajio.com, nykaa.com, croma.com**, plus one store with no pack (any Shopify shop is a good control).

| # | Step | Expected |
| --- | --- | --- |
| A1 | Open a product page | "Vault it — 72h" sits next to Add to Cart, matching its height and corner radius. No layout shift, no overlap. |
| A2 | Click it | Card opens under the button with the right title, image and price. Compare the price with the page: sale price, not MRP; no delivery fee or EMI figure. |
| A3 | Price reading | If the card flags low confidence, the price field is focused and selected for correction. |
| A4 | Type a why, press Enter | Card drops into the vault door (~400ms spring), wheel turns, "Locked. Back in 72 hours." |
| A5 | After the animation | Add to Cart **and** Buy Now are gone — no empty button frame left behind. Locked pill shows a live countdown; the note appears under it. |
| A6 | Top of page | Slim banner: "Vaulted — 71 hours to go." with the note, Details, and a minimise control. |
| A7 | Reload the page | Locked state and banner return; countdown continues; the Vault button does not come back. |
| A8 | Click the (hidden) buy path via keyboard/other entry point | Interstitial appears; the site's own handler never runs (cart count unchanged). |
| A9 | Navigate to the store's cart/checkout URL | Redirected to the checkout interstitial. |
| A10 | Search for the same product and open it from search results | Gate appears (tracking params and slugs must not defeat it). |
| A11 | Open the same product on the mobile host (`m.`) or with a locale prefix | Gate appears. |
| A12 | Open a **different** product on the same store | No gate, no locked state — a normal page with a Vault button. |
| A13 | Browse the store's home page and a category page | Untouched. No banner, no gate. |

Per-store notes to verify specifically:

- **amazon.in / amazon.com** — price comes from the pack (no Product JSON-LD). Check a deal page, a variant page (`th=1`), and an out-of-stock item.
- **flipkart.com** — "Add to cart" is a `<div>`, not a button, and class names change per deploy. Detection must work from the label. Check `/viewcart` and `/checkout/init`.
- **myntra.com** — check both URL forms: `…/42047087/buy` and the short `myntra.com/42047087`. Both must gate.
- **ajio.com** — selectors here are best-effort (bot-blocked to automation). Confirm title/price extraction and that `/cart` blocks; if the pack misses, extraction should fall back silently and Options should show "pack may be outdated".
- **nykaa.com** — bag is a side panel; confirm which URL the checkout actually uses and that `cartPaths` covers it.
- **croma.com** — client-rendered; the ripen-time price re-check will silently fail here (no price in the fetched HTML). That's acceptable: the payout falls back to the vault-time price. Confirm no error is logged.
- **No-pack store** — vault from the toolbar popup. The card offers "Lock this site too"; accept and confirm the gate then applies. Decline and confirm the item is still tracked, marked "tracked only" in the popup.

---

## B. The loop, end to end

| # | Step | Expected |
| --- | --- | --- |
| B1 | Vault something with a 24h cooldown | Appears in Cooling, sorted by soonest, countdown ticking. |
| B2 | Vault the same product again from a differently-decorated URL | "Already in the vault" with the remaining time — no duplicate. |
| B3 | Let a timer expire (see "Fast timers" below) | Item moves to Ripe, badge count increments, lock lifts on the product page. |
| B4 | Ripe notification | "Do you still want this?" with the title and price, plus [Yes, buy it] [No, save ₹X]. |
| B5 | Click **No** on the notification | Decline completes with no UI opening; a payout notification confirms "₹X stays yours." |
| B6 | Open the popup | Total went up, a coin landed on the stack, "₹X stays yours." under the number. |
| B7 | Ripen another and click **Yes** | Product page opens; the item shows as released; stack unchanged. |
| B8 | Open the released product page | A short "Go get it. Three days of wanting is a real signal." line, then it goes away. |
| B9 | Cross a milestone | One-time celebration with a coin shower; re-crossing later does not repeat it. |
| B10 | "Let it go" from the Cooling tab | Pays out immediately, coin flies, item moves to Saved. |
| B11 | Saved tab | Each entry shows the note next to "and you didn't buy it", newest first. |

**Fast timers:** from the service worker console, or by vaulting with the popup and editing storage — the supported way is to create an item with a short cooldown via the console:

```js
chrome.runtime.sendMessage({ type: 'vault/create', draft: { url: 'https://www.amazon.in/dp/B09XS7JWHH', title: 'Test', price: { amountMinor: 249900, currency: 'INR' }, note: 'testing', cooldownHours: 0.0006, lockdown: false, confidence: 'high' } })
```

---

## C. The lock

| # | Step | Expected |
| --- | --- | --- |
| C1 | Visit a cooling product page | Gate, before the retailer page paints. |
| C2 | "Take me back" | Goes somewhere explicit (referrer or store home). Press Back afterwards — **no redirect loop**. |
| C3 | "View the page anyway" | Lands on the exact URL you asked for, one click. |
| C4 | Reload and navigate around that product within 30 minutes | No gate in that tab. |
| C5 | Same product in a **new** tab | Gate again (bypass is per-tab). |
| C6 | Cart URL in the bypassed tab | Still blocked — the product bypass must not unlock checkout. |
| C7 | "Buying something else?" → tick → wait 10s → continue | Cart opens for 10 minutes in that tab. |
| C8 | Vault with **Lockdown** on, then visit the page | Gate has no "view anyway"; only the early-unlock flow. |
| C9 | Early unlock | Confirm stays disabled under 25 characters; countdown restarts if you delete text; 20-second pause; then unlock works and the rules for that item disappear. |
| C10 | After an early unlock | The item shows in the popup; the count of early unlocks goes up, with no shaming language. |
| C11 | An SPA route change into a cooling product (click through from a listing without a page load) | Gate still appears (via the tab backstop). |
| C12 | With no cooling items at all | `chrome.declarativeNetRequest.getDynamicRules()` returns `[]`. Nothing on the web is touched. |

---

## D. Survival

| # | Step | Expected |
| --- | --- | --- |
| D1 | Vault, then quit Chrome entirely and reopen after the timer would have passed | Sweep on startup ripens it; one notification. |
| D2 | Let several items ripen while the browser is closed | A **single** summary notification, not a burst. |
| D3 | Force-stop the service worker (`chrome://serviceworker-internals` or the "service worker" link), then reopen a cooling product page | Gate still fires (dynamic rules persist), and the worker wakes cleanly with no errors. |
| D4 | Reload the extension mid-cooldown (simulates an update) | All items survive with their timers; the badge and rules rebuild. |
| D5 | Set quiet hours to include now, then ripen an item | No notification during the window; it arrives once the window ends. |
| D6 | Turn notifications off, ripen an item | No notification; the item still appears in Ripe with the badge. |
| D7 | Leave a ripe item for the expiry window | Auto-declined softly; shows as "left unanswered" in Saved and counts toward the stack. |
| D8 | Close a tab holding a bypass, then revisit the product | Gate again. |

---

## E. Options and data

| # | Step | Expected |
| --- | --- | --- |
| E1 | Change the default cooldown | The Vault button, context-menu labels and new cards use it. |
| E2 | Change the display currency | Headline total and milestones follow; items keep their own store currency; other currencies appear on their own line. |
| E3 | Edit a milestone and add an equivalence | Shows in the Saved tab and in the celebration. Blank means nothing is shown — never an invented one. |
| E4 | Edit a site pack with broken JSON | A readable error; the pack is not saved. |
| E5 | Save a pack with an invalid CSS selector or regex | Rejected with a specific message naming the field. |
| E6 | Add a pack for a new domain, then "Allow access" | Chrome prompts; afterwards the content script runs there and items on it become locked (not just tracked). |
| E7 | Reset an edited pack | Falls back to the shipped version. |
| E8 | Export | A JSON file downloads containing items, stacks and settings. |
| E9 | Import the same file with **Merge** | No duplicated stack entries and no double-counted total. |
| E10 | Import with **Replace** | Storage matches the file exactly. |
| E11 | Delete everything (type DELETE) | Storage, rules, alarms, notifications and badge all clear. Vault and stack are empty. |
| E12 | Incognito not allowed | Options shows the polite one-time note; "Don't mention it again" hides it for good. |

---

## F. Presentation

| # | Step | Expected |
| --- | --- | --- |
| F1 | Switch the OS/Chrome theme to dark and light | Popup, options, gate, interstitial, card, banner and locked pill all readable in both. |
| F2 | Keyboard only | Tab into the popup, move between tabs with arrow keys, reach every action. The interstitial traps focus and closes on Escape. |
| F3 | `prefers-reduced-motion: reduce` | Vault drop, coin flight and celebration degrade to plain fades. Nothing is lost. |
| F4 | Popup open speed | Renders in well under 100ms with a full vault (one storage read). |
| F5 | Empty states | Cooling, Ripe and Saved each teach the next action rather than saying "nothing here". |
| F6 | A very long product title, a 280-character note, and a ₹1,00,00,000 price | No overflow anywhere: card, popup rows, banner, gate, interstitial. |
| F7 | A page with a hostile title (`<img src=x onerror=alert(1)>`) | Rendered as literal text everywhere. |
| F8 | Zoom to 200% and a 1280×720 window | Popup and pages stay usable. |
