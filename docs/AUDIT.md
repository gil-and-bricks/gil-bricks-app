# Whole-product audit — 2026-09-07

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

### 2.3 Rules that DO still hold — checked, not assumed
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

### 3.3 Not orphans — checked end to end
- **The quiz / `/start`** works: five screens (one optional property screen, then
  four questions) ending on a real recommendation that links to the right
  analyser. Linked from the More sheet and the footer.
- **The map** renders (canvas, clustering, attribution, Article 4). Its sprite URL
  is absolute via `siteConfig.liveUrl`, so on **localhost it logs CORS failures**
  and falls back — production is fine. Dev-only annoyance.
- **`/comparables` standalone** is linked from the nav's More sheet and from each
  strategy index; it is the same engine the analysers embed, not a fork.
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

---

## 5. The product as a whole

### 5.1 No `robots.txt` and no `sitemap.xml` — **half-built**
Both 404. The product relies on per-page `noindex` for private pages and has four
deliberately indexable strategy landing pages. For a free tool whose acquisition
story is search and social, having neither file is a gap.

### 5.2 The quiz calls the strategy "Buy to Let"; everywhere else it is "Buy to let" — **cosmetic**
`config/quiz.json:53` vs `packages/core/src/strategies/index.ts:53`.

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

