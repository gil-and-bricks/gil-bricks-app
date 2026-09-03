# Submitting PropLaunch Deal Analyser to the Chrome Web Store

A click-by-click guide. All the text to paste lives in **docs/STORE_LISTING.md**;
all the images live in **packages/extension/store/**. Do the steps in order.

Things only YOU can decide are flagged with **[YOU DECIDE]**.

---

## Before you start

1. **A Chrome Web Store developer account.** If you don't have one: go to
   https://chrome.google.com/webstore/devconsole, sign in with the Google account
   you want to own the extension, accept the agreement, and pay the one-time
   **$5** registration fee. **[YOU DECIDE]** which Google account owns it.
2. **A contact email** shown to users for support. **[YOU DECIDE]** which email.
3. **The files** (already prepared in this repo):
   - The extension package: `packages/extension/store/proplaunch-deal-analyser-v0.0.1.zip`
   - Store icon: `packages/extension/store/store-icon-128.png`
   - Screenshots: `packages/extension/store/screenshots/1-verdict.png` … `4-measure.png`
   - Small promo tile: `packages/extension/store/promo-tile-440x280.png`
   - The words to paste: `docs/STORE_LISTING.md`

## Step 0a — Deploy the web app first (REQUIRED)

A Chrome reviewer opens your privacy-policy URL and checks it matches what the
extension does. In this sprint the privacy policy **and** landing page were
corrected in the code (to accurately describe the "Send to my analyser" handoff
and the sold-price lookup), but the web app was **NOT deployed**. So the LIVE
pages are still the older versions. **Before you submit, deploy the web app** so
the live privacy policy matches the code:

```
cd packages/web && npx wrangler deploy
```

Then open https://gil-bricks-app.gil-782.workers.dev/extension/privacy in a
private window and confirm it loads with no login and mentions the "Send to my
analyser" handoff. **[YOU DECIDE]** when to deploy (submitting against a stale
policy is a rejection risk).

## Step 0b — Retake the screenshots (recommended before you submit)

The four screenshots in `store/screenshots/` are **honest renders of the real
panel using test listings** — they were NOT captured from a live Rightmove/Zoopla
page (that can't be automated safely here). They're accurate and on-brand, but a
store screenshot should show the actual running product. To retake:

1. Load the extension (see `packages/extension/README.md` → "Load it into Chrome").
2. Open a real Rightmove or Zoopla listing, open the panel, and take a
   1280×800 screenshot of each of: the verdict, the levers + costs, Seller
   Signals, and the measure tool.
3. Save them over the four files in `store/screenshots/` (keep them 1280×800,
   PNG or JPEG, no transparency).

If you're happy to launch with the prepared renders for now, you can — but plan
to replace them. **[YOU DECIDE]**

## Step 1 — Create the item and upload the zip

1. Go to https://chrome.google.com/webstore/devconsole and sign in.
2. Click **New item** (top right).
3. Drag in (or browse to) `packages/extension/store/proplaunch-deal-analyser-v0.0.1.zip`.
4. Click **Upload**. Wait for it to process — you'll land on the item's editing pages.

## Step 2 — Store listing page

Open the **Store listing** tab in the left menu and fill it from `STORE_LISTING.md`:

- **Item name** → paste the "Product name" text: `PropLaunch Deal Analyser`
- **Summary** → paste the "Summary" text (117 characters).
- **Description** → paste the "Detailed description" block.
- **Category** → choose **Productivity** (see reasoning in STORE_LISTING.md).
- **Language** → **English (United Kingdom)**.
- **Store icon** → upload `store/store-icon-128.png` (128×128).
- **Screenshots** → upload all four from `store/screenshots/` (drag them in; put
  `1-verdict.png` first — it's the strongest).
- **Small promo tile** → upload `store/promo-tile-440x280.png` (440×280).
- **Marquee promo tile** → leave blank (optional; only for featured placement).

Click **Save draft** (top right) as you go.

## Step 3 — Privacy page

Open the **Privacy practices** tab and fill it from the same file:

1. **Single purpose** → paste the "Single-purpose statement".
2. **Permission justification** → paste the matching justification for each
   permission the dashboard lists:
   - `sidePanel` → the sidePanel justification
   - `storage` → the storage justification
   - `host permission` for rightmove.co.uk → the Rightmove justification
   - `host permission` for zoopla.co.uk → the Zoopla justification
3. **Data usage** → for each data type in the "Privacy practices — data usage"
   table, select the recommended answer (every one is **No / not collected**).
4. **Certifications** → tick all **three** boxes (all are true — see the table).
5. **Privacy policy URL** → paste
   `https://gil-bricks-app.gil-782.workers.dev/extension/privacy`
   (open it in a private window first to confirm it loads with no login AND shows
   the corrected wording — you must have done Step 0a "Deploy the web app" for the
   live page to match the code).

Click **Save draft**.

## Step 4 — Distribution page

Open the **Distribution** tab:

- **Visibility** → **[YOU DECIDE]**: **Public** (anyone can find it), **Unlisted**
  (only people with the link), or **Private**. For a first launch, Unlisted is a
  safe way to test; Public when you're ready.
- **Regions** → **[YOU DECIDE]**: leave "All regions" or restrict to the United
  Kingdom (the tool covers England & Wales only, so UK-only is defensible).
- **Pricing** → **Free**.
- Contact email → set your support email if prompted.

## Step 5 — Submit

1. Fix any red warnings the dashboard shows (each links to the field to fix).
2. Click **Submit for review** (top right).
3. Review usually takes a few days. You'll get an email with the result.

## Notes and decisions

- **Version.** The package is version `0.0.1`. That's fine for a first upload. If
  you'd rather launch as `1.0.0`, change `"version"` in
  `packages/extension/package.json`, rebuild, and re-zip (see README) before
  Step 1. **[YOU DECIDE]**
- **Every future update** = bump the version, rebuild, zip, and upload a new
  package on the item's **Package** tab.
- **Do not** edit the zip's contents by hand — always rebuild from source.
- The web app is **not** part of the uploaded package, but its privacy policy and
  landing page WERE corrected this sprint and must be **deployed before you submit**
  (Step 0a) — otherwise the live privacy policy won't match the extension and a
  reviewer can flag it.
