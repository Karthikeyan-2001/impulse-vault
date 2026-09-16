# Decisions

Non-obvious tradeoffs, and why they went the way they did.

---

## 1. The limits of cart blocking (the big one)

**You cannot reliably block "add to cart" across the open web.** Buttons are re-rendered by frameworks, class names are obfuscated and rotate per deploy, storefronts navigate without touching the network, and a determined user can disable the extension in two clicks. Anything that claims otherwise is either brittle machinery chasing 100% or lying.

So the goal is not a wall. It's a **reliable speed bump that defeats autopilot**, because autopilot — not deliberate defiance — is what drives impulse purchases. Four layers, deliberately different in strength:

**Layer 1 — product-page gate (soft).** A dynamic `declarativeNetRequest` redirect per cooling item, `main_frame` only, matching the *product id* portion of the URL rather than the full string, so tracking params, slugs and locale prefixes (`/-/hi/`) don't defeat it. This fires before a single byte of the retailer page loads: no selector rot, no SPA races, no re-render timing.

It is passable in one click, on purpose. Revisiting a product page during the cooldown is *deliberation* — re-reading reviews, comparing, checking whether the price dropped. A hard block there punishes exactly the behaviour the product wants. Passing sets a 30-minute, per-tab bypass so internal navigation doesn't re-trigger it.

**Layer 2 — cart/checkout block (hard).** Same mechanism, matching cart and checkout paths on domains that currently hold a cooling item. This is the layer that actually stops purchases, so it gets the friction, and the layer-1 bypass explicitly does not apply to it (different URLs, lower priority).

**Layer 3 — click interception (best effort).** Capture-phase listeners at `window` for the case where the user has passed the gate and is on a live product page. Also `pointerdown`/`mousedown`/`touchstart`, because some storefronts act on press rather than click.

**Layer 4 — form-submit guard (best effort).** Capture-phase `submit`, for sites that POST a form instead of running a click handler. Note that `form.submit()` called from script fires no event and cannot be caught — layer 2 catches where it lands.

**What this means in practice:** layers 1 and 2 are dependable; layers 3 and 4 are helpful but will miss things as sites change. The product is honest about this rather than pretending the DOM can be held down.

## 2. The cart block blocks the *cart*, not just the item — so it has an honest exit

The spec's rule ("block cart/checkout on any domain holding a cooling item") means one pair of vaulted headphones would block buying groceries on the same store for three days. That's the kind of collateral damage that gets an extension uninstalled, and it would push people to unlock an item early for reasons that have nothing to do with that item.

So the cart interstitial offers a third option below "I'll wait" and "Unlock early": **"Buying something else from this store?"** — tick a box confirming your cart doesn't include the vaulted items, sit through 10 seconds (less friction than an early unlock, which is 25 characters + 20 seconds), and that tab gets a 10-minute cart pass. It's a loophole by design: an honest one, cheaper than lying to yourself by unlocking the item.

## 3. Per-tab bypass is a session `allow` rule, not a content-script check

The redirect happens before any content script could run, so a content-script bypass check is structurally too late — and would produce exactly the back-button loop the spec warns about. `tabIds` / `excludedTabIds` are only supported on **session** rules, so the bypass is a session `allow` rule scoped to one tab, at a higher priority than the dynamic redirect it overrides.

Priorities are explicit, because Chrome documents ordering between rulesets as unspecified:

```
200  session  allow     cart pass (one tab, 10 min)
100  dynamic  redirect  cart/checkout → interstitial   (hard)
 50  session  allow     product-page bypass (one tab, 30 min)
 10  dynamic  redirect  product page → gate            (soft)
```

Session rules are cleared when the browser restarts, which is exactly right for anything keyed by tab id.

## 4. Rules are rebuilt wholesale, never patched

`rules = f(items, packs, passes)` is a pure, tested function; the worker removes every rule and adds the computed set on each change and on every worker start. Incremental patching is where stale rules — and therefore redirect loops and items that stay locked forever — come from. The cost is a slightly larger update call; the benefit is that a stale rule cannot outlive a state transition.

A regex Chrome's RE2 rejects (possible via a user-edited pack) is dropped individually after an `isRegexSupported` check, so one bad pack can't fail the whole update and leave *everything* unlocked.

## 5. Never navigate via history from the gate

Pressing Back from the gate lands on the product page, which redirects again. So the gate never uses history: "Take me back" navigates explicitly with `chrome.tabs.update` — to the referrer if there is one and it isn't itself gated, otherwise to the store's home page.

The gate also validates the URL it was handed. Its page is web-accessible, so any site could open it with a crafted fragment; "View the page anyway" only navigates to a URL that actually matches that item's own gate pattern, otherwise to the stored canonical URL.

## 6. A `tabs.onUpdated` backstop for what DNR can't see

SPA route changes never hit the network, so no rule fires. When a tab reports a URL that matches a locked product (or a locked cart) without a pass, the worker sends it where the redirect would have. This also covers any case where a redirect rule didn't apply. It uses no `tabs` permission — a tab's URL is visible only for hosts already granted.

## 7. Site pack before OpenGraph, contrary to the listed order

The spec orders extraction JSON-LD → microdata → OpenGraph → site pack → heuristics, but marks packs `high` confidence and OpenGraph `medium`. Taking a medium source over a high one is backwards, so when a pack exists it runs before meta tags. Everything else keeps the spec's order. Probing the live sites confirmed it matters: Amazon has no Product JSON-LD, and its pack is the only accurate source; Flipkart, Myntra and Nykaa do have JSON-LD, which wins as it should.

## 8. Button detection works from labels, not tags

Modern storefronts render "Add to cart" as a clickable `<div>` (Flipkart's React Native Web UI) with obfuscated class names that change per deploy — `"is it a <button>?"` misses them, and pinning selectors to `css-g5y9jx` guarantees rot. So generic detection walks text nodes for short, exact labels and climbs to the outermost element carrying that same label. That's cheap even on huge pages (text nodes, not every `div`), survives redeploys, and is why Flipkart works with an almost empty pack.

A useful accident: concatenated container text like `"ADD TO BAGWISHLIST"` fails the match because there's no word boundary between the fused words — so clicking anywhere in a buy box doesn't count as clicking the button.

## 9. `keepParams` instead of guessed canonical URLs

A canonical URL template (`https://store.com/p/{id}`) is only safe if a bare-id URL really resolves — it's what "Yes, buy it" opens and what the price re-check fetches. Rather than guess, each candidate was checked against the live site: Amazon and Myntra resolve (templates kept), Nykaa 404s. For the rest, the pack lists which query params identify the product (`keepParams: ["pid"]` for Flipkart's variant id, `[]` to drop them all) and the real URL is kept with the tracking tail stripped.

## 10. Custom two-pass Vite build instead of `@crxjs/vite-plugin`

Content scripts can't be ES modules, and crxjs handles that by injecting a loader that dynamically imports chunks — which requires those chunks to be web-accessible on the page's origin. That breaks on-demand injection into arbitrary sites (`activeTab`, right-click "Vault this page"), which this product needs on any store. So: one Vite build for pages + the module worker, and one self-contained IIFE per content script. It costs a 40-line build script and gives deterministic, dependency-light output.

## 11. One writer for storage

Every mutation goes through the service worker and a serialised promise chain in the storage repo; UI reads directly and subscribes to `chrome.storage.onChanged`. Two contexts doing read-modify-write on `vault:items` (popup and worker both declining the same item, say) would silently lose data. Items and stacks are written in a single `set` so a payout can't half-apply.

## 12. Choices about the psychology, not the plumbing

- **A decline from the cooling tab pays out too.** "Let it go" before the timer ends is the same decision, made sooner; the money genuinely wasn't spent. Withholding the reward would punish the best possible behaviour.
- **An expired item counts, softly.** A ripe item ignored for 14 days is auto-declined and *does* add to the stack, flagged `auto` and shown as "left unanswered" rather than as a win you earned.
- **Removal is not an escape hatch.** A cooling item can only be deleted within a 5-minute undo window (misclick insurance). After that the choices are "let it go" (payout) or the deliberate early unlock — otherwise "remove" would be a zero-friction bypass sitting next to a 20-second one.
- **Buying never subtracts.** The stack is a record of what you didn't spend, not a budget. Releasing an item touches nothing, and the copy says so.
- **The price delta is neutral-to-positive in both directions.** "Price dropped ₹400 since you vaulted this" / "Price went up ₹400 — good thing you waited?" Never "only 2 left", never a countdown to a deal. Manufacturing urgency is the exact psychology this product exists to defeat; there's a test asserting the copy contains no urgency or shaming words.
- **Early unlocks are counted and shown without judgement.** The mirror is the point; the guilt isn't.

## 12b. All-sites access is a toggle, not a default

Working on every store needs host access to every site, and Chrome says so in the bluntest
possible words. For a product whose pitch is "everything stays local", silently shipping that
in the manifest would be the wrong trade — the install prompt is the one moment the user gets
to judge it. So the manifest asks for seven retailers, and everything beyond that is granted by
the user: one store at a time from the vault card, or all of them from one Options toggle.

The cost of all-sites mode is that the content script runs on every page. It therefore decides
in a few microseconds whether a page can possibly matter: a small index of domains holding
vaulted items, plus a dozen indexed selector lookups for product-page evidence (JSON-LD, an
og:product tag, a cart form). Only then does it wake the worker. Nothing is read, sent or
stored on any other page.

## 12c. Platform packs: fingerprint the software, not the domain

Per-domain packs do not scale to the long tail of brand-owned shops, and the long tail is where
impulse buying happens. But those shops are not bespoke: most run Shopify, WooCommerce or
Magento. So a pack can carry `detect` selectors instead of `domains` and be matched by
fingerprinting the storefront (Shopify ships a `shopify-checkout-api-token` meta tag), which
makes one pack worth thousands of domains.

This also fixed a real gap: Shopify checkout lives at `/checkouts/c/…`, which the generic cart
paths missed (`checkout` does not match `checkouts`), and Shopify's "Buy it now" jumps straight
there. And because a Shopify product is reachable at both `/products/x` and
`/collections/y/products/x`, matching on the product handle dedupes what would otherwise be two
vault entries for one thing.

A detection miss is not a failure: the store simply falls back to the generic strategies, which
is what happened on the custom-built store this came from.

## 13. No affiliate links — a direct conflict of interest

Affiliate revenue pays per completed purchase. This product's job is to prevent purchases the user would regret. Monetising the "yes" would give every design decision — the gate's passability, the friction dial, the copy on the ripe notification — a financial reason to nudge toward buying, and the user could never be sure which way a nudge pointed. So: no affiliate links, no referral tags, and canonicalisation actively *strips* `tag`, `ref` and `linkCode` params rather than adding them. Same reasoning for no analytics: a behavioural product that measures you is asking you to trust a promise it can't keep locally.

## 14. Milestone equivalences are the user's words

"₹10,000 ≈ two months of groceries" is meaningful only if it's true for *you*. An invented equivalence is a guess about someone's life, and a wrong one is either patronising or absurd. Options takes a free-text line per milestone, and the celebration shows nothing if it's empty.

## 15. Notifications: one, or a summary

If the browser was closed all weekend, several items ripen at once. A burst of notifications is the fastest way to get notifications turned off, so more than one ripening becomes a single summary. Quiet hours defer rather than drop: items keep `notifiedAt` unset and the next sweep after the window picks them up.

## 16. Multi-currency: separate stacks, never converted

Prices are stored in minor units with the store's currency. Rates change, and inventing one would make the single number the whole product rests on quietly wrong. Each currency gets its own stack; the display currency drives the headline and milestones, and the rest are shown beside it.

---

## Explicitly not built

No accounts, no cloud sync, no server, no price-history charts, no affiliate links, no social sharing, no streaks that break, and no shaming copy anywhere. The user isn't weak; the checkout flow is just very well designed.
