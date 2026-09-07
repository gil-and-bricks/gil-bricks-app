# Whole-product audit — 2026-09-07

> **Acted on in sprint A1, same day.** The operator ruled on all of it. What was
> fixed: CI (§2.3) and a flags-off job (§2.4); the homepage's flags-off promise
> (§2.1); both stray calculations, plus a test that stops new ones (§2.2); the
> desktop route to /comparables and /credit (§3.3); the dead `#valuation` link
> and the strategy pages themselves, now ruled SEO landing pages (§3.1, §3.2);
> robots.txt and sitemap.xml (§5.1); the time-on-market and auction exclusions
> reworded to permit reading the page the user opened (§1.1); Parquet struck
> (§1.4); the one-commit rule reworded (§1.3); the comps save removed (§4.4);
> and a local preview of the five surfaces nobody had seen (§4.2). Still open:
> the Kit automations (§4.1), which only the operator can build, and two
> cosmetics nobody ruled on — `EMAIL_DRAFTS` living in a config file (§4.3) and
> the quiz's "Buy to Let" capitalisation (§5.3).

Twenty sprints, 109 commits, three packages. Nobody had stepped back and read the
whole thing against its own rulebook. This is that read.

Method: the rulebook and every doc in `docs/` read end to end; the commit log read
from the first commit forward; the running product driven in a browser, including
with **every feature flag turned off**; production probed directly. Findings that
came from an agent sweep were each put to two independent skeptics and only those
that survived both are listed.

Nothing here is a feature request. Severity is one of:

| | |
|---|---|
| **broken** | it does not work, or it loses something |
| **dishonest** | the product or a doc says something the code does not do |
| **orphan** | built, still there, nothing points at it or it no longer fits |
| **half-built** | one half shipped, the other did not |
| **drift** | a rule in CLAUDE.md or a doc no longer matches the code |
| **cosmetic** | untidy, no user impact |

---

## 1. Contradictions — where a later sprint broke an earlier decision

### 1.1 The extension ships a permanently-excluded feature — **drift**
`docs/exclusions.md:16` and CLAUDE.md's "Do NOT" list both name **time-on-market**
as a permanent exclusion. The extension computes and displays it:
`packages/core/src/listing/sellerSignals.ts:150` produces `timeOnMarket`, and
`packages/extension/entrypoints/sidepanel/main.ts:529` renders it — I saw
"First listed 19 days ago (rightmove)" in the live panel.

The exclusion's stated *reason* is "portal-only data, not freely licensed", and
what the extension does is narrower than that: it reads the first-listed date off
the one page the user personally opened, in their own browser, and says it back to
them. Nothing is fetched, stored or republished. So the feature is probably fine
and the RULE is probably too broad — but as written, the rulebook forbids a
feature that is live in a published Chrome extension.

**Recommendation — decide.** Either amend `exclusions.md` and CLAUDE.md to say
"time-on-market **as a dataset we publish**; reading it off the page the user
opened is fine", or remove the line from the panel. Do not leave the rulebook
saying one thing and the shipped product doing another. The same nuance applies to
**auction data**: the product detects an auction from the opened listing
(`rightmove.ts:113`) and warns about the legal pack, but ingests no auction feed.

### 1.2 `PIPELINE_STATUS.md` says the pipeline is finished; three sprints changed it since — **drift**
The doc is dated P11 and opens "The pipeline is finished." Since then D3 stopped
bought deals accepting new facts, D4 added migration **0021** (`from_cash`,
`to_cash` on `deal_changes`), the cash-needed change line, and the score-moved
note. The doc lists "migrations 0005–0018" and mentions none of it.

**Recommendation — fix the doc.** It is the file that exists to stop somebody
rebuilding finished work; three sprints stale is exactly how that fails.

### 1.3 "Every sprint is ONE revertible commit" — **drift, minor**
CLAUDE.md, reversibility charter rule 4. There are 19 `docs(...)` commits against
~20 sprints: most sprints are a feature commit plus a docs commit.
`git revert <feat-sha>` restores the product but leaves the decisions-log entry
describing work that is no longer there.

**Recommendation — leave, or reword the rule** to "one revertible *product*
commit". The current practice is better than the rule; the rule should say so.

### 1.4 The rulebook says R2 holds Parquet; it never has — **dishonest**
CLAUDE.md, Stack: *"R2: per-postcode-sector JSON (primary query path) + Parquet +
EW .pmtiles"*, and Phase 2's gate in ROADMAP.md named Parquet too. The word
appears in exactly two files in this repo — CLAUDE.md and ROADMAP.md. **No
pipeline step builds a Parquet file, no code reads one, and nothing in the
product needs one**: the sector JSON is the query path and the pmtiles are the
map.

**Recommendation — delete the claim.** It describes an intention from Phase 2 that
the product grew out of. I have marked Phase 2 "Done, except Parquet" rather than
edit the rulebook's Stack line myself, because deciding whether Parquet is
abandoned or merely pending is yours.

---

## 2. Where the rulebook is no longer true

### 2.1 All flags off does NOT leave a coherent product — **drift, and dishonest in that state**
Charter: "all flags off still leaves a coherent product". I turned all 26 flags
off and walked it. Most of it degrades honestly — the analyser drops to its
pre-Deal-Score verdict ("Amber — it covers its costs, but the returns are thin"),
`/tools` says nothing is switched on, `/credit` and `/deals` redirect.

But **the homepage keeps promising the thing that is switched off**: with
`dealScore: false` it still says *"It scores the deal out of ten and tells you in
plain English what is holding it back"* and still renders the worked sample card
reading **6.7 /10 MARGINAL** — while no analyser will produce a score.

Not live today (`dealScore` is on), so nobody is being misled now. But it is the
one place the charter's promise fails, and the homepage is the first thing a
stranger reads.

**Recommendation — fix when convenient.** Gate the homepage's score sentence and
its sample card on `features.dealScore`, same as everything else.

### 2.2 Two figures are computed in presentation, not in the maths library — **drift**
Charter rule 3: "All maths stays in `@gil-bricks/core`; a UI component may format
a figure, never compute one." Two components compute:

- `components/tools/StampDutyTool.tsx:63` — the **effective tax rate** shown on
  the answer card: `(answer.result.tax / answer.price) * 100`.
- `components/area/AreaApp.tsx:232` — the **"41% below the surrounding mile"**
  figure: `Math.round(((stats.typicalPrice - mileTypical) / mileTypical) * 100)`.

Both numbers are correct. Every other `* 100` in the components is a
fraction-to-percentage conversion for display, which is formatting.

**Recommendation — move both into `@gil-bricks/core`.** Cheap, and it is the exact
class of thing the rule exists to catch.

### 2.3 Nothing runs the tests — **drift**
CLAUDE.md: "After each sprint, the verification gate in ROADMAP.md must
demonstrably pass." There are three GitHub workflows — `data-refresh.yml`
(monthly cron), `keepalive.yml` (weekly cron), `map-tiles.yml` (manual). **None
triggers on push or pull request, and none runs `npm test`, the typecheck or the
build.** `grep -l "npm test\|vitest" .github/workflows/*` returns nothing.

Every gate in this product — the reversibility ratchet, the copy rules, the
no-manual-entry test, the banned-phrase assertions — runs only when somebody
remembers to type `npm test`. The rules are enforced by tests; the tests are
enforced by nobody.

**Recommendation — fix.** One `ci.yml` on push: install, `npm test`,
`npm run typecheck`, `npm run build`. Free on a public repo, no product change.

### 2.4 The suite does not survive the state the charter promises — **drift**
Following on from 2.1: with all 26 flags off, `npm test -w packages/web` goes
**red — 16 tests failing across 6 files** (`urgency`, `board`, `changes`,
`knobs`, `Graveyard`, and one more). They assert flag-ON behaviour and read the
live `features` object, so flags-off is a state nothing verifies.

Not a user-facing bug — but "all flags off still leaves a coherent product" is a
charter promise with no test behind it, which is how 2.1 slipped in unnoticed.

**Recommendation — decide.** Either those tests should force the flags they
depend on (as `board.test.ts` already does in one place), or the charter should
say the suite is only expected to pass in the shipped configuration.

### 2.5 Rules that DO still hold — checked, not assumed
- **One source for the site name.** `siteConfig.siteName = coreConfig.siteName`;
  the only other literal is the extension's static `<title>`, overridden at
  runtime from the same source. Golden rule 4 holds.
- **Migrations additive-only.** All 21 read: 12 `CREATE TABLE IF NOT EXISTS`,
  19 `CREATE INDEX`, 20 `ALTER TABLE ADD COLUMN`, one `DROP INDEX` (0004, widening
  a uniqueness constraint — destroys no data), two documented idempotent backfill
  `INSERT`s (0005). Nothing drops a column or a row.
- **Cash-in includes SDLT.** `maths/investment.ts:16` matches `definitions.md`
  exactly, with the note "cash in includes stamp duty — never quote a return that
  leaves it out".
- **No CDN fonts.** Self-hosted WOFF2 only; the extension has a test that fails on
  any CDN or font host.
- **Dev routes are dead in production.** `/dev/seed`, `/dev/seed/clear` and
  `/auth/dev-login` all return **404** live; `/api/deals` returns 401.
  `/broker/factfind` returns 404 because the broker config is still placeholder.
- **The other exclusions.** LHA, Section 21, Renters' Rights, SpareRoom, student
  demand, portfolio tracker, MEES and Brevo appear nowhere in the source except as
  banned-phrase assertions in tests.

---

## 3. Orphans

### 3.1 The four `[strategy]` index pages are unlinked from the product — **orphan by design, confirm**
`/buy-to-let`, `/flip`, `/brrrr`, `/hmo` exist, render, and are deliberately
**indexable** (`config/noindex.test.ts` asserts it). But nothing inside the product
links to them: the nav and the homepage both go straight to
`/buy-to-let/analyser`. They are reachable only from search or by typing the URL.

That is a legitimate SEO decision — but it was never written down as one, and the
pages have never been part of anybody's journey.

**Recommendation — decide.** If they are SEO landing pages, say so in a comment
and treat their copy as marketing copy. If not, delete them.

### 3.2 "What's it worth?" on those pages lands nowhere — **half-built**
Each strategy index offers three cards; the third says *"What's it worth? — A
plain-range valuation from the sold evidence, and how sure of it we are"* and
links to `/buy-to-let/analyser#valuation`. **`#valuation` does not exist until the
analyser has a postcode, price and property type.** A visitor arriving from search
clicks it and lands at the top of an empty form with no valuation anywhere.

**Recommendation — fix.** Either drop the hash, or have the analyser render a
valuation placeholder section it can scroll to.

### 3.3 Two pages are all but unreachable on a desktop — **broken navigation**
`/comparables` and `/credit` live in `NAV.more`, which is rendered **only** by
`TabBar.astro` — and the tab bar is `display: none` above 640px. `Header.astro`
renders `NAV.mine` (Deals, Account) plus Analyse, Area and Tools;
`Footer.astro` links only to Terms, Privacy and the two socials. I checked every
rendered link at 1440px.

What is left on a desktop:

| Page | Desktop route in |
|---|---|
| `/comparables` | the four unlinked strategy index pages (3.1), and the back-link on a transaction detail |
| `/credit` | one link, on `/bridging-finance` — which is itself hidden (below) |

So `/comparables` — the second-biggest thing the product does — is reachable on a
desktop only from pages nothing links to. On a phone both are one tap away, which
is why this has never shown up.

**`/bridging-finance` is a separate case, and it is working as designed.** It is
a top-level header item (`nav.ts:82`) AND a More-sheet item (`nav.ts:102`), but
`bridgingReady()` (`nav.ts:119`) filters it out of **both** while `BROKER` is
still `TBC`. So today it is reachable from no link anywhere, at any width — on
purpose: the comment says sending people to a page that answers "enquiries are
not open yet" is a dead end. It comes back the moment the broker's details are
real (4.2). Nothing to fix; worth knowing, because a desktop "More" would not
surface it.

**Recommendation — decide.** The clean fix for the other two is a "More" item in
the desktop header reading from the same `moreLinks()` the tab bar uses, so one
config list serves both breakpoints. That is a design change, so it is yours.

### 3.4 Not orphans — checked end to end
- **The quiz / `/start`** works: five screens (one optional property screen, then
  four questions) ending on a real recommendation that links to the right
  analyser. Linked from the homepage and from the More sheet — the only one of
  the More-sheet pages that is also reachable on a desktop.
- **The map** renders (canvas, clustering, attribution, Article 4). Its sprite URL
  is absolute via `siteConfig.liveUrl`, so on **localhost it logs CORS failures**
  and falls back — production is fine. Dev-only annoyance.
- **`/comparables` standalone** is the same engine the analysers embed, not a
  fork. Linked from the More sheet and from each strategy index — see 3.3 for
  what that means on a desktop.
- **`/transaction`** is linked from the comps table and the map popups.
- **`saved_deals` vs `deals`** are a deliberate 1:1 pair, both written and both
  read (`pipeline.ts:442` joins them). Not a leftover.
- **`/styleguide`** is `noindex` and says so on the page. Publicly reachable.

---

## 4. Half-builts

### 4.1 Every outbound path in the product is a Kit automation that does not exist — **half-built**
The app never sends email; it queues a row and Kit acts. Six actions are queued:
`subscribe`, `unsubscribe`, `bridging-qualified`, `bridging-not-yet`,
`factfind-ready`, `lead-<tool>` (`worker/lib/outbox.ts`). **Each needs an
automation built in Kit.** Until then the queue fills and nothing reaches anybody.

Every one is gated, so nothing is broken or dishonest today — but this is the
single largest block of work standing between the product and a real user getting
anything back from it.

### 4.2 Five surfaces exist that have never rendered — **half-built**
All gated on config the operator has not filled in:

| Surface | Gate | State |
|---|---|---|
| Bridging enquiry form | `BROKER.name/email/inbox` + two tag ids | all `TBC` |
| The broker fact-find | above + `BROKER.kitTagFactFind` | `''` |
| The broker's own link page | as above | 404 live |
| The credit page's button | `CREDIT.affiliateUrl` | `''` |
| Tool capture offer (×3) | each tool's `kitTag` + `kitAutomation` | `''` |

The gates all work — the pages explain themselves and collect nothing. But the
operator has never seen any of these five working.

### 4.3 `EMAIL_DRAFTS` is documentation living in a config file — **cosmetic**
`config/capture.ts:154` holds three full email bodies for the operator to paste
into Kit. Nothing in the code reads them. Correct content, wrong home — it is a
doc, and it sits in a module the client bundle imports.

### 4.4 A saved comparables deal promised a score nothing could produce — **broken and dishonest — FIXED**
Saving from `/comparables` writes a deal with `strategy: 'comparables'`
(`AnalyserApp.tsx:281` passes that id to `ActionBar`). `dealHref` finds no route for it and falls
back to `/comparables` — a page that runs `AnalyserApp` with `showVerdict={false}`
and therefore never scores anything. `missingRequiredInput` knows nothing about
that strategy, so it returned `null` and the board card read **"Tap to score
this"**. I reproduced it: a card reading *Terraced · CF37 1HR · £120,000 / COMPS /
Tap to score this*, whose link opens a page with no verdict island on it. Tapping
it did nothing, forever.

**Fixed.** `cardVerdict` now checks the deal's strategy against the real strategy
list: a deal with no analyser behind it shows its figure quietly, exactly like a
terminal deal ("typical £120,000"), and offers nothing. One condition, no new
copy, no maths. Test: `board.test.ts` → "a deal saved from /comparables never
promises a score that page cannot produce".

Stated honestly: if such a deal was saved from a search with no typical price,
its figure is an empty string and the card's verdict line is blank. That is the
same behaviour a terminal deal or a flags-off card already has, and a blank line
is not a promise — but it is not nothing, either.

**Decided in A1:** `/comparables` no longer offers the save at all, and the API
refuses `strategy: 'comparables'`. Rows already in D1 are untouched and still
render — the guards that carry them stay.

---

## 5. The product as a whole

### 5.1 No `sitemap.xml`, and the `robots.txt` is not ours — **half-built**
`/sitemap.xml` is a **404**. `/robots.txt` returns **200**, but nothing in this
repo serves it: it is Cloudflare's default managed file (the "content signals"
policy). It contains no `Disallow`, no `Sitemap:` line and nothing about this
product, and it would be replaced the moment we add our own.

For a free tool whose acquisition story is search and social — with four
deliberately indexable strategy landing pages — that is a gap, and the missing
`Sitemap:` line is the half that matters.

**Recommendation — fix when convenient.** Add `public/robots.txt` (allowing
everything, naming the sitemap) and generate `sitemap.xml` from the same route
list `noindex.test.ts` already knows.

### 5.2 Five documents stated things that were not true — **dishonest — FIXED**
Not style: each stated a fact that was false.

- **`README.md`** described a single-package app from sprint 15. Wrong product
  name, no monorepo, no extension, no pipeline, no tools, no auth — and a
  scaffold map listing eight directories (`src/lib/maths/`, `src/config/rates.json`,
  `src/lib/comparables/`, …) that moved into `packages/core/` in sprint E1. Six of its ten
  commands failed at the repo root, and a seventh (`wrangler deploy`) had no
  config to read there.
- **`ROADMAP.md`** was 82 commits stale: titled "Gil & Bricks", phases 5–11 marked
  "Not started" when 5–8 had shipped, and Phase 2 saying pmtiles "remain" when
  they shipped in S7.1.
- **CLAUDE.md and `docs/FEATURE_FLAGS.md`** both put the inline-copy ratchet
  baseline at **"617 strings / 35 files"**. `INLINE_COPY_BASELINE` in
  `reversibility.test.ts` sums to **67 across 21 files** — 617/35 was the figure
  the day the ratchet was written. The debt has been paid down by 89% and the
  rulebook never said so, so the one number that shows the ratchet working was an
  order of magnitude out.
- **`docs/STORE_SUBMISSION.md`** step 0a told the operator the web app had **NOT**
  been deployed and the live privacy policy was stale. It has been deployed many
  times since; the live page carries the "Send to my analyser" wording. Following
  that doc meant re-deploying for no reason before every store submission.

**Fixed** — all four rewritten against the real tree, the real flag file and the
live pages.

### 5.3 The quiz calls the strategy "Buy to Let"; everywhere else it is "Buy to let" — **cosmetic**
`config/quiz.json:53` vs `packages/core/src/strategies/index.ts:53`.

### 5.4 A gate that failed on CPU load, not on code — **broken — FIXED**
`packages/core/src/score/scoreDeal.test.ts` sweeps a grid of thousands of engine
runs per strategy and sat on vitest's **5-second default timeout**. Run beside the
other 27 files it went red at random. Because core runs first, a red there meant
the web and extension suites never ran at all — so a random timeout could hide a
real failure anywhere in the product.

**Fixed** — a 60s timeout on that describe block, with the reason written above
it. The core suite is green (28 files, 425 tests) and no longer depends on how
busy the machine is; wall-clock varies from about 8s to 15s, which is exactly the
spread that used to decide whether it passed.

---

## 6. What the operator has never seen

**Surfaces that exist and have never rendered for you:** the bridging enquiry
form; the fact-find's three screens; the broker's single-use link page; the credit
page's affiliate button; the tool capture offer on all three tools; every Kit
email; the deal graveyard's *pattern* line (needs five dead deals sharing one
reason); the re-trade radar (needs a fact that moves the price on a live deal);
the chain-risk card (needs a deal at Offer accepted); the auction warning; the
extension's daily desktop notification; the all-flags-off product.

**Raised in a report and never answered:** the bearer-token-in-an-email residual
risk on the fact-find link (D4); whether the broker's "if equity" question attaches
to remortgage or to business equity (F2); the third-party personal data the
fact-find collects (the gift-giver's name); whether you need a processor agreement
with the broker; the Chrome Web Store `[YOU DECIDE]` items (owner account, support
email, visibility, regions, screenshots); and the valuation that can read
£344,520 for a £150,000 flat — now caveated, but the number is still shown.

---

## 7. What I fixed in this audit

Only the plainly broken and the plainly dishonest. Nothing was redesigned, no
behaviour was changed on taste, and nothing shipped that the operator has not
already agreed to.

| # | What | Why it qualified |
|---|---|---|
| 4.4 | The board no longer offers "Tap to score this" on a deal with no analyser behind it | The promise could never be kept — reproduced in a browser |
| 5.4 | 60s timeout on the Deal Score consistency grid | A gate that fails on CPU load is not a gate, and it hid the other two suites |
| 5.2 | `README.md` rewritten against the real tree | Described a product that has not existed since sprint E1 |
| 5.2 | `ROADMAP.md` status corrected | 82 commits stale; six shipped phases marked "Not started" |
| 5.2 | Copy-ratchet baseline corrected to 67 strings / 21 files (CLAUDE.md + `FEATURE_FLAGS.md`) | Both said 617 / 35 — an order of magnitude out |
| 5.2 | `STORE_SUBMISSION.md` corrected in three places | Told the operator to fix a deploy that happened days ago, and still called the package v0.0.1 |
| 1.4 | Phase 2 in `ROADMAP.md` marked "Done, except Parquet" | The rulebook claims R2 holds Parquet; nothing has ever built one |
| 1.2 | `PIPELINE_STATUS.md` brought through D3 and D4 | Three sprints stale, including a migration it did not list |

**What shipped:** the board fix (4.4) is the only product change in this commit;
everything else is documentation and test configuration. It was deployed
immediately after the commit and checked in the live bundle — before that deploy
the live board still carried the bug.

## 8. Questions I could not answer from the repo

- **Which version of the extension is live?** `packages/extension/store/` holds
  both `v0.1.0` and `v0.2.0` zips, and `package.json` says `0.2.0`. Whether
  v0.2.0 was ever uploaded to the Chrome Web Store is something only your
  developer dashboard knows. If it was not, the live extension predates every fix
  from D3 onward.
- ~~Are the four `[strategy]` index pages meant as SEO landing pages?~~ **Yes,
  ruled in A1** — written into `src/config/strategyLanding.ts` and the page.
- ~~Should `/comparables` be able to save into the pipeline at all?~~ **No,
  ruled in A1** — the save is gone from the page and refused by the API.
