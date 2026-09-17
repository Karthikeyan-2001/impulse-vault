# Chrome Web Store — Privacy practices tab

Paste-ready answers. Each one describes what the code actually does; reviewers check.

---

## Single purpose

```
Impulse Vault adds a cooling-off period to online shopping. The user puts a product in a vault, that product's buy buttons and the store's checkout stay locked for a period they choose (72 hours by default), and when it ends they decide whether to buy it or record the price as money saved.
```

---

## Permission justifications

### activeTab

```
When the user clicks "Vault this page" in the toolbar popup or the right-click menu, the extension reads the product's title, price and image from that tab so it can be added to the vault. activeTab limits this to the tab the user acted on, so no broad access is needed for stores without a built-in pack.
```

### alarms

```
Each vaulted item has a cooling-off timer, typically 72 hours. Extension service workers cannot hold timers that long, so the extension schedules an alarm for when each item's period ends, plus a periodic check that catches up if the browser was closed. Alarms also end quiet hours and expire the short per-tab passes the user can grant.
```

### contextMenus

```
Adds "Vault this page" and "Vault this link" to the right-click menu, so a product can be vaulted from any page or link, including stores where the extension has no in-page button.
```

### declarativeNetRequest

```
This is how the lock works. While an item is cooling off, a redirect rule sends that product's page to the extension's own page, which shows the time left and offers a one-click "view the page anyway". A second rule redirects that store's cart and checkout pages to an interstitial, so the purchase can't be completed on autopilot. Rules exist only for items currently cooling off and are removed when the period ends. The extension does not block ads, modify headers, or read request contents.
```

### Host permissions

```
Built-in stores (amazon.in, amazon.com, flipkart.com, myntra.com, ajio.com, nykaa.com, croma.com): the extension reads the product's title, price and image on product pages, places a "Vault it" button beside Add to Cart, replaces the buy buttons with a countdown while an item is cooling off, and applies the redirect rules described above, which require host access. When a period ends, it requests that product's page once to show the current price.

Optional access to other sites is requested only when the user asks for it: to lock a specific store, or through an off-by-default "work on every shopping site" setting. Without it, items from other stores are tracked but not locked.
```

### notifications

```
When an item's cooling-off period ends, the extension asks "Do you still want this?" with "Yes, buy it" and "No, save" buttons, so the user can decide in one click without opening anything. It also confirms the amount saved and marks milestones the user has set.
```

### offscreen

```
When a cooling-off period ends, the extension fetches that product's page to check whether the price changed or it sold out. Parsing the page requires DOMParser, which is not available in an extension service worker, so an offscreen document (reason: DOM_PARSER) parses it and is closed afterwards.
```

### scripting

```
Injects the extension's own packaged content script into the current tab when the user vaults a page from the popup or right-click menu, and registers that script for any store the user grants access to, so the Vault button and lock work there. No remote code is injected.
```

### storage

```
Stores the user's vault on their device: each item's product URL, title, price, image URL, the note the user wrote about why they want it, and its timer; the running total of money saved; and settings. Short-lived per-tab passes are kept in session storage. Nothing is synced or sent anywhere.
```

---

## Remote code

Select: **No, I am not using remote code.**

(Verified: all JavaScript ships in the package; no `eval`, no `new Function`, no remotely hosted scripts.)

---

## Data usage

Local-only data still counts — the User Data FAQ says handling must be disclosed "even when data is processed or stored locally on a user's device and is not transmitted to external servers."

Tick:

- [x] **Website content** — product title, price and image are read from pages.
- [x] **Web history** — URLs of vaulted products are stored, and open tabs are checked against them to apply the lock.
- [x] **User activity** — clicks on buy buttons are watched so they can be intercepted while an item is cooling off. They are not recorded, but the extension does handle them.

Leave unticked: personally identifiable information, health, financial and payment information, authentication information, personal communications, location.

Certify all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** required once any data type is ticked. See `PRIVACY.md`; it needs a public URL.

---

## Test instructions (optional, but recommended)

```
The core flow uses a 24-hour to 7-day timer, so here is how to see every part without waiting:

1. Open any product page on amazon.in (or another built-in store) and click "Vault it" beside Add to Cart. Write a reason and click "Lock it". The buy buttons become a countdown.
2. Revisit the product page in a new tab: it redirects to the gate. "View the page anyway" passes in one click. Then open the store's cart: it stays blocked.
3. From the gate or the popup, "Unlock early" shows the deliberate early-exit flow (a written reason, then a 20-second pause).
4. In the toolbar popup, "Let it go" on a cooling item shows the decision and the Saved Stack.

No account or login is needed. All data stays in the browser; Options > "Delete everything" resets it.
```
