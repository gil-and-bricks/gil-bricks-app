# Listing fixture corpus

Real Rightmove and Zoopla for-sale pages, saved once and kept here so the
listing extractors can be built and tested against genuine markup **without ever
touching the internet**.

## Hard rules (never break these)

- **These saved files are the ONLY portal pages the project ever reads.** The
  browser extension must never fetch a Rightmove or Zoopla page itself, and no
  test may make a network request to a portal. The corpus-health test
  (`packages/core/src/fixtures/listings.test.ts`) blocks the network and fails
  if anything tries.
- **Nothing personal is stored here.** The pages were saved while logged out and
  then run through the sanitiser (see below), which strips third-party tracking
  and asserts no personal data remains.
- The data is read straight out of the saved HTML (Rightmove's `__PAGE_MODEL`
  script, Zoopla's App-Router flight chunks) — never by injecting code into a
  live page.

## What each fixture covers

| file | portal | postcode | price | type | tenure | beds | floor area | floor plan | update | first live | desc len |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `rightmove/rightmove-leasehold-flat-added.html` | Rightmove | SA1 8AJ | £170,000 | Apartment | Leasehold | 2 | — | no | Added on 30/05/2026 | 30/05/2026 | 3257 |
| `rightmove/rightmove-reduced-terrace-leasehold.html` | Rightmove | SA5 8BD | £110,000 | Terraced | Leasehold | 3 | — | yes | Reduced on 09/06/2026 | — | 2367 |
| `rightmove/rightmove-reduced-detached-freehold.html` | Rightmove | SA2 7DX | £510,000 | Detached | Freehold | 4 | — | yes | Reduced on 02/09/2025 | — | 4603 |
| `zoopla/zoopla-auction-terrace-floorplan.html` | Zoopla | SA2 0PX | £150,000 | Terraced (guide price / auction) | Freehold | 3 | — (listing states none; Zoopla estimate 1,539 sq ft) | yes | — | 2026-08-13 | 400 |
| `zoopla/zoopla-newhome-6bed-hmo-candidate.html` | Zoopla | SA1 6AB | £290,000 | Terraced (new home) | Freehold | 6 | 2,099 sq ft | no | — | 2026-08-14 | 658 |
| `zoopla/zoopla-newbuild-semi-floorplan.html` | Zoopla | SA2 8NW | £412,000 | Semi-detached (new build) | Freehold | 4 | 1,479 sq ft | yes | — | 2026-06-04 | 49 |

Why each one is here:

- **rightmove-leasehold-flat-added** — a leasehold flat, freshly "Added" (so its
  first-live date is known), and it has **no floor plan and no floor area** — the
  "sparse listing" case.
- **rightmove-reduced-terrace-leasehold** — a **reduced-price** terrace that is
  also **leasehold** (a leasehold house, not just a flat), with a floor plan.
- **rightmove-reduced-detached-freehold** — a higher-value **freehold** detached,
  **reduced** a while ago, full address, floor plan, long description.
- **zoopla-auction-terrace-floorplan** — a **guide-price / auction** listing with
  a floor plan but **no floor area stated by the listing** (Zoopla shows its own
  estimate instead) — tests that we don't mistake the estimate for a stated size.
- **zoopla-newhome-6bed-hmo-candidate** — a **6-bed** house (an **HMO candidate**),
  new home, with a stated floor area but **no floor plan**.
- **zoopla-newbuild-semi-floorplan** — a **new build** with a floor plan and a
  stated floor area, and a very short description (typical of new builds).

## How the data is stored inside each page

You don't need to know this to add a fixture — it's here for whoever maintains
the extractors.

- **Rightmove** puts everything in a script that starts `window.__PAGE_MODEL =`.
  The value is compressed with a library called `flatted` (it replaces repeated
  bits with numbers). The loader un-compresses it back into the real listing.
  (Note: it's `__PAGE_MODEL` with two underscores, not the older `PAGE_MODEL`.)
- **Zoopla** is a newer "App Router" site. The listing is streamed in lots of
  little `self.__next_f.push([...])` scripts that the loader joins back together,
  plus a clean `application/ld+json` summary. (Zoopla no longer uses the
  `__NEXT_DATA__` blob that older guides mention.)

## How to add another fixture later (no coding needed)

1. Open the listing in **Google Chrome**.
2. **File → Save Page As…**, and in the "Format" dropdown choose
   **"Webpage, Complete"**. Save it anywhere (your Desktop is fine).
3. Chrome saves **two things**: an `.html` file and a folder next to it ending in
   `_files`. **We only keep the `.html` file** — you can ignore/delete the
   `_files` folder.
4. Rename the `.html` file to something short that says what it is, all lowercase
   with hyphens, e.g. `zoopla-leasehold-flat.html` or
   `rightmove-chain-free-terrace.html`.
5. Put it in the right folder:
   - Rightmove pages → `packages/core/fixtures/listings/rightmove/`
   - Zoopla pages → `packages/core/fixtures/listings/zoopla/`
6. Run the sanitiser once so no tracking is left behind:
   `node packages/core/fixtures/listings/tools/sanitise.mjs`
   It prints what it removed and confirms the file is clean. If it complains,
   tell whoever maintains the code — don't commit until it says "clean".
7. Add a row to the table above and a line under "Why each one is here".
8. That's it — the corpus-health test will automatically pick up the new file
   and check it parses.

Keep the corpus small: **HTML files only**, no `_files` folders, and try to stay
under ~15 MB total.

## Sanitisation — what was stripped and how it's checked

`tools/sanitise.mjs` runs over the files in place and is safe to re-run (running
it again changes nothing). It:

- removes third-party analytics/ad **scripts** (Google Tag Manager, Google
  Analytics, DoubleClick/ad exchange, Visual Website Optimizer, Permutive, etc.);
- blanks out Zoopla's `__ZAD_TARGETING__` ad-targeting block (`{}`);
- redacts any personal token it can find (login email, session/auth tokens,
  analytics cookie values) — **the saved pages had none**, because they were
  saved logged out;
- then **asserts** that no executable tracker tag, no ad payload and no personal
  token remains, and that each page's listing data still parses.

Judgment call: some ad-network **hostnames** still appear as plain text *inside*
the listing data (Zoopla serialises its ad-loader config into the same flight
stream that holds the listing facts). Those are the portal's own configuration,
not anything of yours, and they can't be removed without corrupting the listing
data this corpus exists to test — so they're left as-is. The sanitiser therefore
checks for live tracker **tags** and personal **tokens**, not for hostnames
mentioned in the data.
