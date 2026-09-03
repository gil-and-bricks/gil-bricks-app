# Chrome Web Store listing — PropLaunch Deal Analyser

Paste-ready copy for the Chrome Web Store developer dashboard. Every field is
labelled. Written plain and direct — no hype, no guru talk, no exclamation marks.

> Honesty note (read before pasting). The copy below is written to match what the
> code ACTUALLY does — do not "simplify" it into absolutes like "sends nothing
> about the page", which would be a false privacy claim and a rejection risk.
> The extension never transmits the page's content on its own, but:
> - to score a deal the panel requests sold-price data for the property's
>   **postcode area** from our Cloudflare store (and refreshes its reader config there);
> - the measure tool loads the listing's **floor-plan image** from the portal (to display, not upload);
> - when the user clicks **"Send to my analyser"**, the extension carries the deal
>   — including the property's **address and price** and the figures entered — to our
>   web app in a new tab, and if the user is signed in there and saves it, those
>   details are stored in their account.
> The live privacy policy must reflect all of this before you submit (a reviewer
> checks the URL). The policy source was corrected in this sprint but the web app
> was NOT deployed — DEPLOY the web app before submitting so the live policy matches.

---

## Product name (field: "Item name")

```
PropLaunch Deal Analyser
```

## Summary (field: "Summary", 132 characters max)

```
Score any Rightmove or Zoopla listing as a property deal — BTL, Flip, BRRRR or HMO — with real sold-price data. Free.
```

Character count: **117 / 132** (within limit).

## Detailed description (field: "Description")

```
PropLaunch turns any Rightmove or Zoopla listing into a clear investment decision, right in a Chrome side panel next to the page you're viewing.

Open a listing, open the panel, and it reads the price, type and size and scores the property as a deal — with a plain 0–10 Deal Score, the headline reason, and the single thing holding it back. You answer at most one or two figures (like the rent) and it's done.

FOUR STRATEGIES, ONE PANEL
- Buy-to-Let — rent cover, cashflow, return on cash and price vs sold evidence
- Flip — profit after tax and sale price vs nearby sold prices
- BRRRR — money left in after refinance, cashflow and rent cover
- HMO — room income, cashflow, return and whether rooms meet the legal minimum sizes (with a floor-plan measure tool)

REAL DATA, NOT GUESSWORK
Scores use HM Land Registry sold prices, the UK House Price Index and EPC floor areas — official open data, not asking prices. A suggested figure is always labelled as an estimate, never shown as a fact.

FREE, AND IT STAYS FREE
No account needed to use the panel. No subscription, no trial.

WHAT IT DOES NOT DO
- No scraping. It reads only the one listing page you personally open — it never crawls the portal or opens pages in the background.
- It never sends the page's content anywhere on its own. The listing's text, exact address and price stay on your device — until you choose to click "Send to my analyser", which carries the deal (address and price included) to our website in a new tab to dig into further.
- To score the deal it looks up sold prices for the property's postcode area from our data store — that's the only page detail sent automatically. The measure tool also loads the plan image from the portal to show you; nothing is uploaded. Full detail is in the privacy policy.
- No tracking, no ads, no selling of data.

GOOD TO KNOW
- Desktop Chrome only (it's a side panel — not available on phones).
- Covers England & Wales only, because that's where the sold-price data reaches.

Made by Gil & Bricks. Privacy policy: https://gil-bricks-app.gil-782.workers.dev/extension/privacy
```

## Category (field: "Category")

**Recommended: Productivity.**

Reasoning: PropLaunch is a task/analysis tool — it helps someone do a specific
job (assess a property as an investment) faster while they work, which is what
the Productivity category is for. It is not a game, entertainment, or a
shopping-cart/coupon tool, so those categories would be a poor fit. "Shopping"
is a plausible second choice (it augments property browsing), but the tool's
value is analysis and decision-making, so Productivity is the honest primary fit.

## Language

English (United Kingdom).

## Single-purpose statement (field: "Single purpose")

```
PropLaunch has one purpose: to analyse the property listing you are viewing on Rightmove or Zoopla and show you an investment Deal Score for it. It reads the open listing, works out the numbers for four common strategies against official sold-price data, and presents the result in the side panel.
```

## Permission justifications (field: "Permission justification", one per permission)

**sidePanel**
```
The whole product is a side panel: it displays the deal analysis alongside the Rightmove or Zoopla page the user is viewing. The sidePanel permission is required to open and show that panel.
```

**storage**
```
Used only to remember the user's own inputs on their own device (chrome.storage.local): their default strategy, their assumptions and criteria, a remembered rent per area, and per-listing figures they enter. Nothing is uploaded or synced. It lets the user avoid re-entering the same settings on every listing.
```

**Host permission: `*://*.rightmove.co.uk/*`**
```
The extension reads the listing page the user has open on Rightmove to extract the price, property type and size it needs to score the deal. This host permission is required for the content script to read that page. The content script reads the page on demand only; it never fetches other Rightmove pages and never sends the page's content anywhere.
```

**Host permission: `*://*.zoopla.co.uk/*`**
```
Same as above, for Zoopla: the content script reads the listing page the user has open to extract the figures needed to score the deal. It never fetches other Zoopla pages and never transmits the page's content.
```

## Privacy practices — data usage declarations (field: "Privacy" tab)

The extension collects **no user data**. Recommended answers for each disclosure:

| Data type | Collected? | Why |
|---|---|---|
| Personally identifiable information (name, address, email, age, ID) | **No** | The extension needs no account and stores nothing identifying. |
| Health information | **No** | Not handled. |
| Financial and payment information | **No** | No payment/account data is handled. The deal figures the user types are their own analysis inputs (not financial-account data); they stay on the device and are sent only when the user clicks "Send to my analyser" — to the developer's own web app, a user-initiated action, not background collection. |
| Authentication information | **No** | The extension has no login. |
| Personal communications | **No** | Not handled. |
| Location | **No** | No user-location data is collected. The property's postcode area is sent to fetch public sold-price data, and on "Send to my analyser" the property's postcode/address is passed to the developer's web app (and stored there if the user saves the deal while signed in) — this is the LISTING's location, not the user's, and the user is never located or profiled. |
| Web history | **No** | Not collected. |
| User activity (clicks, mouse position, keystrokes) | **No** | No analytics or activity tracking of any kind. |
| Website content (text, images, the page) | **No** | The page's text and images are never transmitted. The panel extracts the price and address locally; those are sent only when the user clicks "Send to my analyser" — to the developer's own analyser web app, a user-initiated transfer for the tool's single purpose, not background harvesting of page content. |

**Three required certifications — tick all three (all true):**
1. "I do not sell or transfer user data to third parties, outside of the approved use cases." — **Yes / tick.** No data is sold or transferred.
2. "I do not use or transfer user data for purposes that are unrelated to my item's single purpose." — **Yes / tick.**
3. "I do not use or transfer user data to determine creditworthiness or for lending purposes." — **Yes / tick.**

**Privacy policy URL (required):**
```
https://gil-bricks-app.gil-782.workers.dev/extension/privacy
```

Note: this URL must return HTTP 200 with no login before you submit — it does
(confirmed in sprint E11). The privacy policy covers both the extension and the
website account, and matches what the code actually does.

## Store assets (upload these from `packages/extension/store/`)

- **Store icon (128×128):** `store-icon-128.png`
- **Screenshots (1280×800):** `screenshots/1-verdict.png`, `2-levers.png`, `3-signals.png`, `4-measure.png`
- **Small promo tile (440×280):** `promo-tile-440x280.png`
- Marquee tile (1400×560) — optional, not produced; only needed for featured placement.

> The screenshots are honest renders of the REAL panel with fixture data (no
> portal was fetched). Retake them from a real live listing before you submit —
> a store screenshot should be the actual running product. See STORE_SUBMISSION.md.

## Fields you must decide yourself

- **Support email / contact** — the dashboard requires a contact email.
- **Visibility** — Public, Unlisted, or Private.
- **Distribution / regions** — leave default (all regions) or restrict to UK.
- **Whether to retake screenshots** from a live listing first (strongly recommended).
