# Feature flags

The ONE place a user-facing feature is switched on or off is
`packages/web/src/config/features.ts`. Flip a boolean there, rebuild, deploy —
that is the whole rollback. No flag lives anywhere else (not in
`site.config.ts`, not in env vars, not in a component); a test
(`src/config/reversibility.test.ts`, check A) fails if one appears elsewhere, and
`src/config/features.test.ts` fails if a flag exists in code without a row here.

| Flag | Default | What it turns ON | What happens when it's OFF |
|---|---|---|---|
| `dealScore` | on | The 0–10 **Deal Score** chip and the "what's holding it back" note on every analyser verdict (all four strategies). | The verdict banner, lever line and tiles still show exactly as before the score existed. Nothing is scored, and the pipeline board stops asking for one: every card shows its figure quietly instead of a "Tap to score this" prompt that could never complete. |
| `dealPipeline` | on | The **deal pipeline**: the board at `/deals` (stages, moves, park/kill, the today line, the counter), the save-to-pipeline mirror and the `/api/deals/*` routes. | `/deals` redirects to `/account`, which shows the flat saved-deals list. Saving a deal still works (it is written to `saved_deals` as before). The pipeline-only API routes (`/stage`, `/dead`, `/score`) answer 404; save, list and delete keep working as before. Nothing is deleted — the `deals` tables keep their rows for when the flag comes back. |
| `stickyVerdict` | on | The **sticky verdict bar** on the analyser pages (N1): Deal Score + tier colour + the verdict line pinned under the header, updating in place as inputs change; tap to expand; jump to the full card. Mounted ONCE on the shared analyser shell, so all four strategies inherit it. | No bar, no live region of its own. The verdict card is the only place the score shows and its banner is the polite live region again — the pre-N1 analyser in behaviour (the markup keeps one N1 addition: the verdict `<h2>` is focusable, which nothing uses while the bar is off). Needs `dealScore`: with `dealScore` off there is nothing to show, so the bar is off regardless (`stickyVerdictActive()`). |
| `sectionOverview` | on | The analyser's **section overview strip** (N2): a scrollable row of jump chips pinned under the sticky verdict bar, the quiet "↑ Back to inputs" link after the verdict card, and the comparables module folded behind its one-line summary ("14 comparable sales · typical £245/sq ft · tap to explore"). Chips are plain anchors — jumping needs no JavaScript — and a chip only renders when its section is actually on the page, so a strategy that has no Area section never shows an Area chip. Mounted ONCE on the shared analyser template, so all four strategies inherit it. | No strip, no back link, and the comparables module is open as it always was. The maths and assumptions accordions stay collapsed either way (they were already collapsed; N2 only swapped the JS accordion for a native `<details>`, which is why that part is not flagged). |
| `segmentedStrategy` | on | The **strategy switcher pinned in the sticky stack** (N3): BTL · Flip · BRRRR · HMO as one segmented control sharing the pinned row with the section chips, the current one filled lime. Four links to four URLs, carrying every shared input across, with arrow keys moving between them. | The switcher renders where it always did — a row of pills inside the page above the verdict card. Exactly one switcher either way. |
| `compsMobile` | on | **Phone-first comparables** (N3): below 640px each sale is a compact card (address, price, date, type/tenure, £/sqft, distance, include toggle) and the table is not built at all; above 640px the table stays and the cards are not built. The seven filters fold into one "Filters · N set" sheet at EVERY width (seven controls dominate a phone and clutter a desktop), with a Reset when any are set. Sorting is table-only, so a phone reads the sales in distance order — noted in DECISIONS_LOG as a deliberate omission. | The 11-column table on every width and the filter strip open above it, exactly as before. The map is load-on-demand either way, and the list is the default view either way. |
| `desktopSplit` | on | The **desktop analyser layout** (N4): from 1024px the verdict card splits into inputs + assumptions on the left and a sticky results rail (Deal Score, verdict, figures including costs) on the right, so the answer stays on screen while you scroll the inputs; from 1100px the section overview becomes a vertical list beside the page instead of a chip strip. Pure CSS over the same DOM — same URL state, same extension handoff, same components. | One column at every width, exactly as before, and the section overview stays the horizontal chip strip. Nothing about the phone layout depends on this flag either way. |
| `navV2` | on | The **grouped header** (an "Analyse" disclosure holding the four strategies, then Area Data, Tools, Finance, with Deals and Account to the right) and the **five-item bottom bar** (Analyse · Area · Tools · Deals · More) where More opens a sheet with Finance, Account, the quiz and the legal pages. | The flat header (Area Data + the four strategies) and the old bottom bar (Area + the four strategies). `/tools` and `/bridging-finance` still exist and are still indexed — they are honest pages either way, just not linked from the nav. |
| `bridgingFinance` | on | The **bridging enquiry** at `/bridging-finance` (F1): the explanation, the sign-in gate, the two-step form, and the `POST /api/bridging` endpoint that qualifies server-side, stores the enquiry in D1 and queues the Kit row. | The page still loads and still explains what bridging is and what the introduction would be, but no form renders and the API answers 404 — nothing can be submitted, and nothing is stored. |
| `toolsSection` | on | The **tools** section (T1, extended in T2): the `/tools` index driven by the registry in `src/config/tools.ts`, and the calculators themselves — stamp duty/LTT at `/tools/stamp-duty`, rental yield at `/tools/rental-yield`, HPI equity at `/tools/equity`. Answers are never gated: no email, no sign-in, and nothing is sent to us. | `/tools` says nothing is switched on and lists no cards; each tool page redirects to `/tools` rather than standing there asking a question it cannot answer. |
| `dealFacts` | on | Facts and re-scoring on a saved deal (P5): add what happened — a builder's quote, a survey finding, a down-valuation, auction fees, a service charge or ground rent — and the deal re-runs the SAME `@gil-bricks/core` maths the analyser runs, writing a verdict snapshot each time. Non-numeric facts (a covenant, a short lease) flag the deal and never invent a cost. Every re-score reuses the sold-price band the saved score was judged against (`deals.sold_evidence`, P5.1), and re-saving from the analyser folds the applied facts into the deal's own numbers. | Off: no "what happened" control and no fact list on the board, `/api/deals/:id/facts` is 404, a deal keeps the score it was saved with, and nothing is ever folded in. Facts already recorded stay in the database untouched. The sold-price band is still stored on save — it is a property of the score, not of this feature. |
| `verdictChanges` | on | **Verdict-change messaging** (P6): when a fact moves a deal's score across a band, or by a full point, the card says so in the user's own voice — the old score, the fact and what it replaced, the new score, and the engine's own consequence-and-fix line. It stays until dismissed (stored in `deal_changes`, so it survives a reload), offers to park a deal a fact has killed (never parks by itself), and opens a **score history** sparkline built from the `deal_verdicts` snapshots. | Off: facts still re-score a deal exactly as they do today, but nothing announces it, no change row is written, the ack and history routes are 404, and the score-history control disappears. Changes already stored stay in the database untouched. |
| `evidenceChips` | on | **Evidence chips** (P7): a small strip under the Deal Score — Refurb, End value, Rent, Comps and Room sizes, each where the strategy has one — filled when the input is evidenced, outline when it is assumed, dashed when nobody knows; then one line naming the weakest input and the single thing that would fix it. The rules, the labels and the sentence all come from `@gil-bricks/core`, so the deal card and the analyser verdict cannot disagree. | Off: no chips and no line on the deal card or the analyser. Scores, verdicts, facts and re-scoring are untouched — nothing is derived from the chips. **The extension is out of this file's scope** (see "Out of scope on purpose" below): it is a separately published artifact, it reads the same core rules, and its strip is removed by shipping a build without it — this flag does not reach it. |
| `dealDates` | on | **Dated deadlines** (P8): a chase date on any live deal, an auction date where the deal came from an auction, and an exchange date once the offer is accepted — set with the phone's own date picker, cleared with one tap. They feed the top tier of the today line's urgency ranking (`URGENCY` in `src/config/pipeline.ts`). | Off: no date controls on any card and `POST /api/deals/:id/date` is 404. The today line still ranks, without its dated tier. Dates already set stay in the database, untouched and unshown. |
| `dealGraveyard` | on | **The dead-deal graveyard** (P9): killing a deal captures one reason chip (`PARK_REASONS`), an optional one-line note and a FROZEN snapshot of the card as it died — its score, the engine's verdict line, its evidence chips, its facts and the stage it reached (`deal_deaths`, migration 0016). The board gains a collapsed "Deals you killed" view, most recent first, with a pattern line that only speaks above `GRAVEYARD.patternMin` and always states its sample, and a "Bring it back" action that restores the deal to the stage it died at and re-scores it against today's rules. | Off: the board shows P4's plain parked list again, the kill sheet has no note field, no pattern is ever shown and `POST /api/deals/:id/revive` is 404. Deaths are still captured in the background, so switching it on later shows the full history rather than a hole. |
| `calendarExport` | on | **Calendar export** (P10): an "Add to calendar" control on any deal holding a date that still applies to it. It builds a `.ics` in the browser — one VEVENT per date (viewing, chase, auction, exchange), all-day, with the deal's link in the description, a `VALARM` asking for a day's notice, and on an AUCTION event the cash needed from the deal's own analysis (with whether auction fees are in that number). No server, no cost. | Off: no button on any card and no file is ever built. The dates themselves, the today line and the urgency ranking are untouched. It also needs `dealDates`: with dates switched off there is nothing to export, so the button does not appear. |
| `chainRisk` | on | **The chain-risk card** (P11): when a deal reaches *Offer accepted*, a fixed honest note that accepted is not safe — around four in ten agreed sales never complete, nearly two in five of those collapse in the first four weeks, and the things that kill them here are surveys, down-valuations, lending and chains. Approximate industry figures, described as approximate, about the market and never about this deal. Once per deal, dismissible (`deals.chain_ack_at`, migration 0018). Wording: `CHAIN_RISK` in `src/config/pipeline.ts`. | Off: no card on any deal, nothing is stored, and `POST /api/deals/:id/chain-ack` is 404. Dismissals already stored stay in the database. |
| `retradeRadar` | on | **The re-trade radar** (P11): when a survey finding or a down-valuation moves a LIVE deal, its card shows the reverse-solved new maximum offer (from `maxOfferForVerdict` in `@gil-bricks/core` — the same score, judged against your own thresholds) and a message you can copy to the agent, naming the fact and both numbers. It appears only when the fact really moved the deal AND a lower price really would fix it. **Copy only: the app never sends anything.** Wording and the triggering facts: `RETRADE` in `src/config/pipeline.ts`. | Off: no radar on any card. Facts still land, still re-score and still announce exactly as they do today. |
| `brokerFactFind` | on | **The broker's fact-find** (F2): after a bridging enquiry qualifies, a third step in the same flow collecting what the broker needs to get quotes — name, whether a company is buying, date of birth, address, home ownership and lender, other property, refurbishment experience, credit answer, savings and where the deposit comes from. Every field required, conditionals only where the question applies. **No file upload:** it asks whether a credit report is available, and he requests it directly. Stored in `bridging_factfinds` (migration 0019) and **never in Kit** — he is notified with a single-use link that expires in `FACTFIND_RULES.linkHours` and is deleted by the cron after `keepAfterViewedDays` / `keepMaxDays`. | Off: a qualified enquiry ends exactly where F1 ended it, `POST /api/bridging/factfind` and `/broker/factfind` are both 404, and nothing new is collected. Rows already stored stay until retention deletes them. It also needs `BROKER.kitTagFactFind` filled in: without a way to notify him, the step does not render at all. |
| `toolCapture` | on | The post-answer capture path on the three tools (T3): after the answer is on screen, one offer to email the breakdown — Google sign-in or a typed address with a human check. The answer is never gated by it, and dismissing it is remembered for the session. A tool also needs its own Kit tag AND a named Kit automation in `src/config/capture.ts`, so with those empty NOTHING is offered even when this is on. | Off: no offer block on any tool, no `/api/tools/lead` route, and the tool pages make no server call of their own. |
| `creditPage` | on | The credit page at `/credit` (T3) — the site's one paid partnership, with the ASA "AD" marker at the top and the disclosure above the link. Linked from the bridging page and the More sheet, never from Tools. | Off: `/credit` redirects to the homepage and the link disappears from the nav and the bridging page. Separately, an empty `affiliateUrl` in `src/config/credit.ts` keeps the page but shows no button at all. |
| `scoreMovedNote` | on | D4. When a saved score no longer matches what the deal's own inputs produce — because D4 made every surface read sold evidence the same way — the card says what it was, what it is now, and offers to take the new one. Nothing is ever rewritten without a tap. Threshold: `SCORE_MOVED.minPoints` in `src/config/pipeline.ts`. | Off: the stored score stands silently, no note appears, and the board fetches no sector files at all. |
| `criteriaHandoff` | on | D4. "Send to my analyser" carries the minimums a person set in the extension, so the analyser judges by their bar and says whose it is — instead of quietly reverting to the strategy's defaults. Params: `minCashflow`, `minRoi`, `minIcr`, `minProfit`. | Off: those params are ignored and every analyser judges by config exactly as before. The extension still sends them; they simply do nothing. |
| `measurementHandoff` | on | D4. Room sizes measured on the floor plan in the extension survive the handoff, instead of dying at the click — it is the only real evidence anyone has about room sizes. Params: `roomFails`, `roomsMeasured`. Anything typed into the analyser's own accordion always wins. | Off: the analyser reads only rooms typed into its own accordion, as before. |
| `cashNeededChange` | on | D4. A fact that moves what you must find UP FRONT is announced even when the Deal Score does not move at all — a £25,000 builder's quote took the cash needed from £47,000 to £72,000 and left a 7.0 at 7.0, and the card said nothing. Threshold: `CHANGE_RULES.minCashChange` in `src/config/pipeline.ts`. | Off: the change block behaves exactly as P6 left it (score moves only), and no cash figures are written to a change row. The `from_cash`/`to_cash` columns stay, holding NULL. |
| `valuationTypeCaveat` | on | D4. When the sector's sold evidence is about a different kind of home than the subject, the "What it's worth" card says so BESIDE the estimate; past a stated multiple the caveat leads and the estimate is demoted below it. Ratios: `VALUATION_TYPE_CHECK` in `src/config/comparables.ts`. | Off: the estimate and its existing "less certain" line are exactly as they were. The estimate itself is never changed or hidden either way. |
| `desktopMore` | on | A1. A More menu in the DESKTOP header, reading the same `NAV.more` list as the phone's bottom sheet minus what the desktop already shows (Account in the header, Privacy and Terms in the footer). Without it neither `/comparables` nor `/credit` has a link in the desktop header: the tab bar that holds them is `display:none` above 640px, and what is left is a link from a strategy landing page (which nothing links to) and one from `/bridging-finance` (which the broker gate hides). Config: `desktopMoreLinks()` in `src/config/nav.ts`. | Off: the header is exactly as it was — Analyse, the primary links, then Deals and Account. The phone sheet is untouched; those pages become reachable on a desktop only by URL. |
| `pdfExport` | **off** | The PDF export of a result (D1). While off there is no PDF button and no "coming soon" caption on any analyser — an unbuilt feature is hidden, not shown greyed out. Turn it on in the sprint that builds it. | On: the disabled PDF button and its caption return to the action bar. |

## Known trade-off

With `stickyVerdict` ON, the verdict card's banner is no longer a live region
(the bar is the ONE polite region — two would double-announce). Since N2 that
region carries the score, the tier, the binding headline AND the lever sentence
("A £22,000 lower price or £185 more rent a month would turn this Amber to
Green"). What it still does not read out is the price-vs-evidence cross-check,
which stays in the card for on-demand reading.

## All flags off (proved 2026-09-04, N1)

With every flag `false` the app builds and runs as a coherent product: the
analyser shows inputs → comps → valuation → verdict banner + tiles (no score
chip, no sticky bar, the banner announces to screen readers); Save still works;
`/account` lists saved deals flat; `/deals` redirects to `/account`; the
pipeline API is 404. Nothing half-renders. See DECISIONS_LOG.md → N1.

## What the guardrail covers (and doesn't)

`src/config/reversibility.test.ts` enforces the charter in six checks:
flags only in `features.ts` (A) — in `.ts`, `.tsx` AND `.astro` frontmatter,
covering `siteConfig.features`, a flags object anywhere else, `FEATURE_*`
constants, an exported boolean switch and `import.meta.env` reads (Vite's own
PROD/DEV/SSR/MODE excepted); a positive control that each of those shapes still
matches a probe, so a broken regex fails loudly instead of going blind (A2);
brand HEX only in `tokens.css`, 6- and 8-digit, with one allow-listed
server-rendered page (B); config-owned copy (stage/park/fact labels, board +
sticky copy, the cap message) never re-typed (C); no score/yield/ROI threshold
in a component (D); and an **inline-copy ratchet** (E).

The ratchet counts, per file, in `src/components/**` and `src/lib/**` (TS/TSX)
and the Astro chrome (`src/components/**`, `src/layouts/**`): JSX/Astro text
(including text wrapped around an `{expression}`), strings in user-facing
attributes, any string in an unknown prop on one of our own components, and
sentence-like literals (three or more words) elsewhere. It does NOT count
one- and two-word literals in plain TS, or `throw`/`new Error`/`console`
messages — so it is a ratchet on *copy*, not a proof that no string exists.
A file not in the baseline is held to ZERO, so every NEW component's copy must
live in config; an existing file may only go down (move copy out → lower its
number). The baseline is the honest debt figure: **67 strings across 21 files**
(it started at 617 across 35 files on 2026-09-04 and has only come down).
Brand-colour `rgba()` tints of the lime (pre-N1, in `analyser.css`) are not
covered by check B — tokenising them is a later job.

**Check F, the ARITHMETIC ratchet (A1).** Charter rule 3 — a component may
format a figure and never compute one — now has a partial test. It parses every
TS/TSX file under `components/` and `lib/`, plus the frontmatter of the `.astro`
files in scope, and flags arithmetic (including `total += price`) whose
expression NAMES a domain value: price, tax, rent, ROI, yield, ICR, cashflow,
profit, equity, LTV, refurb, GDV, ARV, deposit, £/sqm, £/sqft, stamp duty,
mortgage, interest.

**What it cannot do.** It classifies by what the code calls its values, so
renaming `typicalPrice` to `here` hides the same calculation from it. It is a
smell detector for the ordinary way rule 3 gets broken, not a proof that no
maths exists in the UI — the rule is still review discipline first.

**What it does not flag:** a domain fraction turned into a percentage for a
formatter (`icr.threshold * 100`), a formatter's string joined to something
(`fmtMoney(price) + ' each'`), and anything naming none of those words — array
indexing, loop counters, and geometry expressed in `H`, `PAD`, `i` and `n`.
Geometry that DOES name a domain value is flagged, and two chart components are
in the baseline for exactly that reason.

`ARITHMETIC_BASELINE` grandfathers the **11 calculations across 8 files** that
were already there: the £/sqm→£/sqft conversion done in six places (four in the
comps table, one on the area page, one in the map layer), a bridging total summed
in JSX, an equity share derived from LTV, a re-trade comparison against a config
minimum, a sort comparator on price, and the map's price colour ramp. Same rule
as the copy ratchet: a listed file may only go DOWN, and a file that is not
listed is held to ZERO.

Out of scope on purpose: page PROSE under `src/pages/**` and `src/content/**`
(landing, about, legal, styleguide) is content, not configuration; the Worker's
JSON error strings; the extension package. Adding those is a later decision.

## Adding a flag

1. Add the boolean to `FeatureFlags` + `features` in `features.ts` with a
   doc comment (what it turns on, what off looks like).
2. Add a row to the table above.
3. Gate the feature at its ONE entry point (a component's early `return null`,
   a route's redirect, an API's 404) — never sprinkle the flag through maths.
4. Prove the off state: turn it off, build, use the app.

## Retiring a flag

A flag that has been on in production for months may be deleted together
with its `if` — never leave a dead flag behind, and never delete data or a
migration to do it.
