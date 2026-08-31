# Decisions Log

A running record of choices made while building Gil & Bricks. Newest sprint at the top.

## 2026-08-31 — Sprint S4.2: BTL verdict

- **Brief truncated again** (mid test-list; verify/commit steps missing) — tail reconstructed from the established sprint pattern; commit message chosen below.
- **Verdict thresholds live in StrategyConfig** (minCashflowGreen £150, minRoiGreen 8%, ICR 1.25 basic/company vs 1.45 higher-rate) — tuning the verdict is a config edit. Rules as specified: GREEN = ICR pass ∧ after-tax cashflow ≥ £150 ∧ ROI ≥ 8; AMBER = ICR pass ∧ cashflow ≥ £0; RED = ICR fail ∨ negative cashflow.
- **BTL maths is a composition module** (src/lib/strategies/btl.ts): it contains no new formulas — every figure comes from src/lib/maths calls with their breakdowns; the "what would turn this Green" lever binary-searches over those same lib functions (price affects stamp duty piecewise, so closed-form inversion would mean re-deriving maths — search over the canonical code can never drift from it).
- **Tax treatment of voids (logged)**: taxable rental income = rent actually received (net of the void allowance); management/maintenance/insurance are the allowable costs. Gross yield uses full asking rent (the conventional headline); net yield uses running costs over all-in cost per definitions.md.
- **Strategy params ride the same URL** as the shared state (keys from config; defaults omitted) — a shared link restores the full BTL scenario including assumptions.
- **Hand-worked example**: £150k England terrace, £750 rent, 25%/5%, basic-rate → SDLT £8,000, cash-in £47,000, cashflow −£30.87/mo, S24 credit swallows the tax entirely, ICR 1.45 → verdict Red with a lever to Amber. Two of my own hand-computations were wrong on first pass (a coincidentally-scaling ICR and a voids slip) — the code was right; the test comments now carry the corrected arithmetic.
- **Verification-driven fixes** — the BTL refurb-budget key collided with the shared subject "refurb" URL key (shared links silently lost the refurb condition — renamed refurbCost, and a test now bans collisions for every strategy); strategy select values hydrate with clamping like the shared state (a hand-edited taxBasis could silently compute the wrong stamp duty); verdict thresholds now fail LOUDLY if missing from config instead of reverting to code constants; input fallbacks derive from config defaults, not literals; net yield reuses the core cost derivation; lever bisection tightened so the £5/£250 rounding is the only slack. The pattern is documented in docs/STRATEGY_CONFIG_GUIDE.md.
- **Commit message chosen**: "feat(btl): config-driven BTL verdict with ROI/yield headlines, Section 24 and ICR".

## 2026-08-31 — Sprint S4.1: Analyser shell

- **Preact + @preact/signals chosen** over Svelte — ~5KB proven islands runtime, TSX fits the strict-TS codebase, and module-level signals share state naturally inside the single analyser island. One island per page (form + results together) keeps state wiring trivial.
- **No Land Registry proxy Worker needed** — probed live: landregistry.data.gov.uk sends `Access-Control-Allow-Origin: *`, so the browser calls it directly and the site stays pure static assets. The proxy plan stays in the back pocket if their CORS policy ever changes.
- **/transaction uses a query param, not a path segment** — static-first hosting can't serve unknown /transaction/{id} paths without server rendering; ?id= achieves the same shareable detail page.
- **All analyser state lives in the URL** (subject inputs, filters, excluded comp ids) — shareable, restorable, nothing personal; defaults are omitted so links stay short.
- **EPC area helper reads our own sector data** (address-matched floorAreaSqm) rather than calling the EPC API from the browser — zero extra credentials client-side; the user's typed value always wins and the UI names the source in use.
- **Verdict slot placeholder is rendered by the shell** — StrategyConfig.verdictSlot stays null and unconsumed until S4.2 wires real verdict components from config; the four configs share the same subject inputs.
- **Lighthouse-driven fixes**: the first run scored performance 76 (LCP 7.7s) because the Land Registry history round-trip ran after the comparables fetch; warming it in parallel plus preconnect hints to the data host and Land Registry took the analyser to 100/100/100/100 with LCP 0.8s. A missing <main> landmark was the only a11y fail — fixed in the shell layout.
- **Verification round two (live browser audit) forced real fixes** — the tooltip failed its own tap contract (first tap closed it) and WCAG 1.4.13 dismissal, now rebuilt with document-level Esc + tap-outside; the ambiguity picker couldn't actually pick (no saon in the URL state — now threaded through); typing a house number fired one Land Registry request per keystroke (now a per-postcode cache with 30s failure memory); 'BTL' was hardcoded in the nav (now config shortName); min/max filters and flat checkboxes lacked accessible names; the homepage had nested <main> landmarks.
- **390px verified by measurement**, not eyeballing: document.scrollWidth == 390 on every new page (the comps table scrolls inside its own wrapper).

## 2026-08-31 — Sprint S3.5: Automatic sale-history lookup

- **Working query form (probed live)**: `GET landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode={PC}&_sort=-transactionDate&_pageSize=200` — the linked-data filter works server-side, so no SPARQL fallback was needed. We filter by POSTCODE only and match the address locally with the pipeline's own normalisation: the server's paon filter is exact-string (would miss punctuation variants) and local matching lets ambiguity be detected instead of guessed.
- **Ambiguity = ask, never guess** — a paon with only flat records and no saon supplied returns the candidate list for the UI to present; the engine's auto-fill skips ambiguous cases entirely.
- **Auto-lookup is best-effort by design** — timeout (6s), network failure or ambiguity degrade to "no line A" (lastSaleSource: none); an enhancement must never break the core valuation. User-supplied sales always win and skip the lookup.
- **Only Category A sales auto-fill line A** — repossessions/portfolio transfers (B) are not market evidence for indexation.
- **Timezone-safe date parsing** — Land Registry returns "Fri, 01 Aug 2025"; Date.parse + toISOString shifts that a day backwards during BST, so the date is parsed by hand (a test caught this before it shipped).
- **Verification-driven fixes** — the 6s timeout now covers the response BODY too (a stalling server after headers could hang forever); an auto-found sale newer than the HPI's end falls back to the next indexable sale instead of erroring at the user (reachable today: PPD runs a month ahead of UKHPI); truncation past 600 postcode records is flagged, cached results are returned as copies, compact postcodes are re-spaced, GUIDs uppercased (the service is case-sensitive).
- **Commit message**: "feat(valuation): automatic Land Registry sale-history lookup and transaction fetch" (as specified).
- **CF37 1DL has no PPI transactions** (probed live) — the smoke shows that honest none and demonstrates auto-fill on 6 Vaughan Street CF37 1HR instead (sold 2025-08-01 £139,500, found automatically).

## 2026-08-31 — Sprint S3.4: ValuationEngine

- **Brief truncated a third time** (cut off inside Part A) — reconstructed from CLAUDE.md's locked valuation rule (last-sold × UKHPI blended with area £/sqm; ±5/10/20% plain ranges; NO per-attribute adjustments) and the objective line; commit message chosen in-pattern and logged below.
- **UKHPI at country level** (England/Wales monthly all-property index, official Land Registry full file, 1968→latest): the blend's local signal comes from line B's £/sqm; HPI carries market drift only. Region/local-authority indexation is a logged future upgrade — it would need a region code in the postcode maps.
- **manifest.ukhpiMonth now real** (2026-06) — the "" none-value era ends; ukhpi.json is an additive v1 companion at the bucket root.
- **Line inputs are the user's** — the subject's last sale is almost never inside the 12-month data window, so price+date come from the caller (they know what they paid); floor area likewise (EPC bounds 10–500 enforced).
- **Blend = straight mean of the available lines** — plainest reading; weighting invents precision the evidence doesn't have.
- **Confidence ladder (logged verbatim)**: two lines agreeing within 10% AND ≥5 comps behind the £/sqm → high (±5%); two lines within 25% → medium (±10%); wider disagreement → low (±20%); a single line → medium, dropped to low when the £/sqm rests on <5 comps. Always words + range, never a bare %.
- **Valuation reuses the ComparablesEngine result** (accepts one, or runs its own 1mi/12mo/all search) — one engine feeding another, no forked search logic.
- **£/sqm implements CLAUDE.md's "£/sqft" line** — identical maths, metric units (EPC areas are m²); noted rather than editing the locked rulebook text.
- **Verification-driven fixes before commit** — the confidence ladder now counts the comps that actually carry a £/sqm (not the whole list — 12 comps with 3 carriers could have claimed "high"); a floor area that can't be used says so instead of being silently dropped; a too-recent sale date gets "use the price you paid" instead of a 1968 lecture; impossible months rejected outright; reused comparables must match the subject postcode; stats recomputed from the comps array so stale caller stats can't leak in; ukhpi as-of month must exist in BOTH country tables.
- **Commit message chosen**: "feat(valuation): ValuationEngine blending indexed last sale with area £/sqm".

## 2026-08-31 — Sprint S3.3: ComparablesEngine

- **Sector-search margin is per-sector, not a global constant** — sectors-index carries `spanMiles` (farthest live postcode from each sector's centroid); a sector is fetched when centroid distance ≤ radius + its own span. Real geometry justified it: spans run p50 1.3mi / p90 4.6mi / max 36mi, so any fixed margin either misses rural comps or over-fetches cities.
- **Scotland/NI rejection is two-layer** — postcode areas entirely outside England & Wales (plus Crown dependencies) are rejected instantly with a clear "England & Wales only"; border-straddling areas (TD) fall through to the E&W-only outcode files, where a miss reads "check the postcode, or it may be outside England & Wales". Logged: Scottish-side TD postcodes get the softer message.
- **Area bounds exclude unknown-area comps** — when the user sets min/max sqm, comps without an EPC match can't be verified against the bound, so they drop out rather than sneak through.
- **Excluded comps stay in the list** with included:false; stats recompute over included comps only — the UI toggle never refetches.
- **Empty results never auto-widen** — the suggestion string proposes wider radius/period/filters only when something is actually left to widen; at maximum everything it says the area has very little price evidence.
- **Period counts back from manifest.ppdMonth**, never the wall clock — the data's as-of is the only honest anchor.
- **tsx added as a devDependency** for the live smoke script — Node's native type-stripping can't resolve the repo's extensionless TS imports.
- **Verification caught a proven coverage hole and it is now impossible** — sector files include sales at postcodes terminated since the sale, but spanMiles only covered live postcodes; a real Crawley sale sat 1.7mi outside a 0.71mi span, silently invisible to 542 nearby subjects. spanMiles now also covers every window sale (rounded UP), and an exhaustive check across all 605,018 sales shows zero breaches. Two smaller honesty fixes from the same review: empty results caused by price/area bounds now say "try relaxing the filters" instead of falsely claiming thin evidence, and DG joined TD as a border-straddling area (DG16 Gretna has English postcodes that were being hard-rejected).
- **TR21 0 (Isles of Scilly) carries a 36-mile span** — ONSPD itself geocodes live postcode TR21 0PW on the Penzance mainland; the pipeline mirrors the source faithfully, cost is over-fetching one 12-sale sector near west Cornwall. Left as-is; an outlier-trimmed span is a future option if it matters.
- **Portal links are entry pages only** (Land Registry per-transaction open-data page + Zoopla/Rightmove house-prices landing pages) — constructing internal portal property URLs is a compliance no (docs/exclusions.md); noted in code.

## 2026-08-30 — Sprint S3.2: rates.json engine (SDLT/LTT + tax rates)

- **Brief arrived truncated again** (cut off inside the Wales LTT higher-rates reference values and before the commit-message line) — no gap in practice: step 1 makes the live official pages authoritative, so every table was taken from source; the commit message was chosen in-pattern and logged here.
- **Live verification, 2026-08-30**: gov.uk SDLT, gov.wales LTT, gov.uk income-tax/self-employed-NIC/corporation-tax pages all fetched; **every value matched the sprint's reference numbers** — no differences to log. LTT higher (from 11 Dec 2024): 5/8.5/10/12.5/15/17 at £180k/£250k/£400k/£750k/£1.5m, standalone per CLAUDE.md. Both official worked examples (gov.uk £295,000 → £4,750; gov.wales £260,000 → £15,950) are now regression tests.
- **£40,000 de minimis encoded** as sdlt.additionalMinPrice / ltt.higherMinPrice: below it, additional-property purchases fall back to the standard/main table (which taxes them at £0). From HMRC/WRA higher-rates guidance; the truncated brief didn't reach it, but omitting it would overtax sub-£40k purchases.
- **rates.json entries are append-only with effectiveFrom dates** — changing a rate means adding a new dated entry, never editing an old one; the engine picks the newest entry on or before the transaction date, so historical calculations stay reproducible. Every entry carries its source URL + access date.
- **S3.1's constants.ts deleted** — income tax, Class 4 NIC, corporation tax (incl. marginal-relief fraction 3/200 = 0.015) and the Section 24 credit all moved into rates.json; tax.ts reads them via the loader. No rate literal remains in code.
- **flipTax added** (trading income: band rate + Class 4 NIC for individuals, corporation tax for companies) — simplified to the deal alone (other income ignored), stated in its note.
- **Verification-driven hardening** — the displayed Section 24 credit rate now interpolates from rates.json (a hardcoded "20%" in the breakdown strings could silently contradict the computed value); band tables that fail to cover a price throw instead of under-taxing; dates validate as yyyy-mm-dd; today() uses the UK (Europe/London) date; income/NIC entries backdated to 2025-04-06 (same values applied) so historical dates resolve; rates.json + docs/MATHS.md are now in the README scaffold map; `npm run typecheck` (tsc --noEmit) added with typescript/@types/node devDeps.
- **Commit message chosen**: "feat(rates): effective-dated rates.json with SDLT/LTT marginal band engine".

## 2026-08-30 — Sprint S3.1: Maths library

- **Stats maths mirrored, not shared** — the pipeline must stay plain-JS (runs under node with no build step) and the app is strict TS, so src/lib/maths/stats.ts mirrors pipeline/stats.mjs and a parity test locks them together across n % 4 ≠ 0 shapes. Divergence now fails CI rather than lurking.
- **Rates are decimal fractions in code** (0.055 = 5.5%) — breakdowns format them as percentages; the UI layer owns conversion. One convention everywhere beats guessing per-function.
- **Values are unrounded; formatting happens only in breakdowns** — chained maths never compounds rounding. Exceptions: valuation-range endpoints round to whole pounds, and the stats maths (IQM/percentiles) rounds by the locked schema (terminal display values; float artifacts like 200000×1.1 = 220000.00000000003 would leak).
- **BRRRR reads the plainest way**: proceeds = new value × LTV, compared with cash invested; no bridging-redemption modelling at this layer (strategies compose that later). Differences under £1 either way read as plain "All money out" (float noise at deal scale — never "+£0" or "£0 left in").
- **ICR passes on meeting the threshold exactly** (value ≥ threshold), encoded as a test.
- **Flip cash-in = purchase + buying costs + refurb + finance costs** — selling costs come out of sale proceeds so they reduce profit but are not cash employed; flip ROI is labelled a project return, not annualised.
- **Section 24 simplified but honest**: credit = 20% × min(interest, property profit) — the statutory cap on property profits is kept, but personal allowance and other-income interactions are out of scope; the breakdown note says so. Ltd path is a separate function (keeps the personal taxBand union clean) with proper marginal-relief maths between £50k and £250k.
- **Tax rates live in constants.ts temporarily** — S3.2 moves them into effective-dated rates.json per CLAUDE.md.

## 2026-08-30 — Sprint S2.3: EPC floor-area join

- **EPC bulk source: `GET /api/files/domestic/csv`** on api.get-energy-performance-data.communities.gov.uk (Bearer auth; `/info` variant reports fileSize + lastUpdated). Current extract: 8.26GB zip, lastUpdated 2026-08-17 → `manifest.epcExtractDate = "2026-08-17"`.
- **The zip never touches disk** — the HTTP body streams through `bsdtar -xOf -` and an RFC4180 parser straight down to a 6-column `epc-slim.csv`; the ~30GB uncompressed CSV never exists anywhere. Chosen for the CI runner's ~14GB disk; idempotent via the extract's lastUpdated recorded in epc-meta.json.
- **Match rule (conservative, no guessing)**: normalise both sides (uppercase, punctuation → space, collapse); PPD key = norm(SAON + PAON); EPC address = norm(line1+line2+line3) deduped to the LATEST certificate per address; a sale matches when exactly ONE EPC address in its postcode equals the key or extends it as a street prefix ("FLAT 2 8" ↔ "FLAT 2 8 TYFICA ROAD"). Ambiguity is counted BEFORE the area bounds so a junk-area certificate still blocks a same-key neighbour. Areas outside 10–500 sqm are junk → null. Same-day duplicate certificates that disagree on area are ambiguous → address dropped (verification caught ~70 nondeterministic sales).
- **typicalPpsqm needs ≥3 matched sales** — an IQM of one or two values is noise dressed as a statistic; DATA_SCHEMA.md wording updated (v1 clarification, nullability unchanged).
- **Future upgrade: UPRN matching** — PPD lacks UPRNs but the EPC data carries them; joining via a UPRN address lookup (OS Open UPRN + ONS UPRN directory) would lift the match rate above address-string matching. Logged for a later sprint.
- **Production rebuild + upload happens in CI** — this machine deliberately no longer holds the Cloudflare token after the rotation, so the local run is for verification and match-rate reporting; the dispatched workflow (S3 uploader, fresh runner) publishes the real files.

## 2026-08-30 — Sprint S2.2: Real data pipeline (PPD + ONSPD → R2)

- **PPD source: yearly part files pp-2025.csv + pp-2026.csv** (~222MB total) from HM Land Registry's official S3 hosting (the gov.uk "Price Paid Data downloads" endpoints; prod redirects to prod2) — the smallest official set guaranteeing 12 full months; pp-complete is ~5GB for no extra coverage.
- **ONSPD edition: May 2026** — the latest CSV Collection published on the ONS Open Geography portal at build time (August 2026 edition not yet released as CSV). Discovered via the portal search API so the monthly workflow always picks up the newest edition; May 2026 renamed the country column to `ctry25cd`, handled in the build.
- **PPD category A only** — category B (repossessions, portfolio/other non-standard transfers) is not arm's-length market evidence and would distort typical prices. Logged per sprint instruction.
- **Tenure U (unknown) rows dropped** — schema v1 locks tenure to F|L; unknowns are a tiny residue and dropping beats guessing.
- **DuckDB in the runner** (@duckdb/node-api) — parses/joins the ~1.7GB of CSVs in seconds without ever holding them in JS memory; per-sector stats stay in shared JS (pipeline/stats.mjs) so the canonical maths has exactly one implementation shape.
- **epcExtractDate and ukhpiMonth are "" (empty string), not null** — the sprint said null, but schema v1 LOCKS both as strings and the client rejects non-strings; "" is documented in DATA_SCHEMA.md as the none-value. Making them properly nullable is a v2 change if ever wanted.
- **ppdMonth 2026-07 = newest month in the published data** — Land Registry's most recent month or two are inherently incomplete (registration lag); the manifest reports what the source contains, and each monthly refresh rolls the window forward.
- **Upload: Cloudflare REST API when CI secrets exist, wrangler fallback locally** — R2's S3 API needs separate keys (a human step), so CI uses the plain REST object PUT with the repo-secret token, and local runs spawn wrangler under the OAuth session. Idempotent either way: an md5 state file skips unchanged objects, and manifest.json always uploads LAST so the as-of pointer never precedes its data.
- **Fixture CF37-1.json on R2 overwritten by real data by design** — tests use the local copies under data/fixtures/ only.
- **CI upload switched to R2's S3-compatible API with credentials derived from the token secret** — the bucket-scoped R2 API token turned out to be rejected (403) by the client REST object endpoints; per Cloudflare's documented derivation the S3 access key id is the token's id (via the account tokens/verify endpoint) and the secret is SHA-256 of the token value, so the same two repo secrets now drive an uncapped S3 upload (~minutes, full concurrency) with no extra operator steps. Verified live end-to-end.
- **Verification-driven pipeline fixes** — ONSPD discovery needed limit=100 + a looser title match (the item ranked 11th and titles vary by edition); extraction is now tied to the discovered edition with stale CSVs removed; January runs fetch the year-before-last PPD file so the window never silently shrinks; BOTH upload modes self-throttle to ~3.3 req/s with 429-aware backoff — Cloudflare caps the client API at 1,200 req/5min, and a full-speed local run proved the cap covers wrangler puts too (429s from ~5,000 objects in; the state file resumed the run cleanly, and the manifest-last gate kept the as-of pointer unpublished until every sector landed); border-straddling sectors take the majority country; PPD now downloads over HTTPS (path-style S3 URL); refresh cron moved to the 2nd so each run lands just after PPD's month-end release.

### OPERATOR TO DO — CI secrets (one-time, ~5 minutes)

1. In the Cloudflare dashboard: **R2 → Manage API tokens → Create API token** (or dash.cloudflare.com → R2 object storage → {} API → Manage API tokens). Name it `gil-bricks-data-ci`, set **Permissions: Object Read & Write**, and under **Specify bucket(s)** choose **Apply to specific buckets only → gil-bricks-data**. Leave TTL = Forever. Click **Create API Token** and copy the **Token value** shown (not the Access Key ID/Secret — the token string itself).
2. In Terminal, store the two repo secrets (paste the token when prompted):
   `gh secret set CLOUDFLARE_API_TOKEN --repo gil-and-bricks/gil-bricks-app`
   `gh secret set CLOUDFLARE_ACCOUNT_ID --repo gil-and-bricks/gil-bricks-app --body <your Cloudflare account id — shown by `npx wrangler whoami`>`
3. Test it: `gh workflow run data-refresh --repo gil-and-bricks/gil-bricks-app`, then watch with `gh run list --repo gil-and-bricks/gil-bricks-app`.

## 2026-08-30 — Sprint S2.1: Locked data schema + fixture on R2

- **Bucket created with `npx wrangler r2 bucket create gil-bricks-data --location weur`** — Western-Europe location hint for UK users; no EU jurisdiction flag because the bucket holds only public open data (no personal data), and jurisdiction-scoped buckets don't guarantee r2.dev support.
- **Public access via the r2.dev development URL** (`https://pub-ed7263f454104eb1a02055393ee15800.r2.dev`) — £0 and instant; r2.dev is rate-limited and dev-grade, so before launch (Phase 11) the bucket should move behind a custom domain or the Worker. Logged here so it isn't forgotten.
- **CORS: GET/HEAD from any origin** — the data is public open data, and the browser client needs cross-origin reads from the app origin. First `cors set` attempt used the AWS-style rule shape and silently didn't apply; the Cloudflare shape (`rules[].allowed`) worked and the header was verified live.
- **Stats maths pinned in DATA_SCHEMA.md** — interquartile mean = drop floor(n/4) each end then mean; percentiles = linear interpolation (type-7). definitions.md stays untouched (LOCKED); the schema doc adds the computational detail.
- **`typicalPpsqm` is nullable** — a sector where no sale matches an EPC has no honest £/sqm figure; null beats a fabricated number.
- **Sector ids normalised, not trusted** — client uppercases and collapses whitespace ("cf37  1" works); malformed ids throw TypeError (caller bug), reserving the three DataError kinds (NotFound/Network/BadSchema) for genuine data-layer outcomes.
- **Fixture GUIDs use an FA0E… pattern** — Land Registry GUID *format* but visibly fake; both files carry top-level `fixture: true`, and four hand-authored postcodes that fell outside CF37 1 were corrected before upload (a sector file must only contain its own sector's postcodes).
- **Tests read the exact files uploaded to R2** (data/fixtures/) — one source of truth; no drift between what tests validate and what the bucket serves.
- **Verification-driven hardening** — sector files claiming a different sector than requested are rejected (BadSchema), the first sale is spot-checked for corruption, and tests derive URLs from siteConfig.dataBaseUrl so a launch-time base-URL change cannot break them for the wrong reason.

## 2026-08-30 — Sprint S1.3: Design system, brand tokens, site.config

- **First pass rebuilt to the full brief** — the sprint message first arrived truncated mid-step-2; work built from CLAUDE.md's locked brand was reconciled to the full spec when it arrived (fonts switched from direct downloads to @fontsource packages; public/fonts/, fonts.css and BaseLayout.astro removed in favour of the spec'd layout and font setup).
- **Font payload: 84KB woff2** (Montserrat 600/700/800 ~20KB each, Poppins 400/500/600 ~8KB each, latin subset) — under the 150KB budget; @fontsource also emits 108KB of legacy .woff fallbacks, but any one browser downloads a single format.
- **CSS build targets pinned in astro.config.mjs** — verification caught the CSS minifier stripping `-webkit-backdrop-filter` (default targets assume Safari 18+); Safari ≤17 would have silently lost the glass blur. Targets now include safari15 so the locked prefix survives.
- **prefers-contrast: more also gets the solid card** — prefers-reduced-transparency is Chromium-only today, so the contrast preference doubles as a fallback trigger.
- **Inner-glow values chosen** (spec said "subtle", no numbers): white hairline top inset + faint lime bloom, both under 10% opacity.
- **Href-less Buttons render type="button"** — prevents accidental form submits if the primitive is ever used inside a form.
- **Styleguide swatch rows wrap** — verification caught horizontal overflow at ≤375px widths (WCAG reflow); rows now flex-wrap and token values can break.
- **Favicon replaced** — the scaffold shipped the Astro logo; now a neutral, name-agnostic brick mark in brand colours (no lettering, so a future rename costs nothing).
- **Phase 1 marked Done in ROADMAP.md** — gate passes: live URL 200, tokens render per CLAUDE.md, build clean.

## 2026-08-30 — Sprint S1.2: Rulebook & roadmap files

- **CLAUDE.md symlink replaced** — the scaffold shipped CLAUDE.md as a symlink to Astro's default AGENTS.md; the rulebook is now the real CLAUDE.md and AGENTS.md symlinks to it, so any agent tooling reads the same rules from one file.
- **ROADMAP status column added** — the spec asked for objective + gate columns; a Status column was added so a non-technical operator can see progress at a glance, with S1.1 marked complete under Phase 1.
- **£/sqft unit note in definitions.md** — EPC floor areas arrive in m², so the locked £/sqft definition carries a one-line conversion note (1 m² = 10.7639 sqft) to keep it computable without changing the formula.
- **Exclusion reasons limited to the three sanctioned rationales** — every entry in docs/exclusions.md is tagged free-data honesty, simplicity, or compliance, matching the sprint brief exactly.
- **LHA exclusion reattributed to simplicity** — verification caught that LHA rates ARE free open data (VOA on gov.uk), so claiming "free-data honesty" would itself be dishonest; the real reason is the annual-update maintenance burden.

## 2026-08-30 — Sprint S1.1: Scaffold & first deploy

- **Astro 7.2.9 (latest stable), `minimal` template, TypeScript `strict`** — the minimal template ships no demo components or example pages, so there was almost nothing to strip; strict TS costs nothing now and prevents loose typing habits later.
- **`output: 'static'` set explicitly in `astro.config.mjs`** — static is already Astro's default, but stating it makes the static-first intent obvious and means a future adapter can't switch the whole site to server rendering by accident.
- **Cloudflare Workers static assets, not Cloudflare Pages** — the sprint calls for Workers static assets; it is Cloudflare's current recommended path for new projects and leaves room to add Worker code later without migrating hosts.
- **No adapter installed** — Workers static assets serve a prebuilt `dist/` directly, so `@astrojs/cloudflare` would add build complexity for no benefit while the site is fully static.
- **`wrangler.jsonc` over `wrangler.toml`** — JSONC allows inline comments and is Cloudflare's current default format for new Workers.
- **`compatibility_date: "2026-08-30"`** — set to today so the Worker runs on current runtime behaviour; pinning it means future runtime changes cannot silently alter this deploy.
- **Wrangler installed as a project devDependency (v4.127.1)** — the deploy command then uses a version pinned in `package-lock.json` rather than whatever `npx` resolves globally, so deploys are reproducible across machines and CI.
- **`workerd` and `fsevents` postinstall scripts allowed in `package.json`** — npm 11 blocks install scripts by default; these two are the Cloudflare runtime and the macOS file watcher, both needed for local dev.
- **workers.dev subdomain: existing `gil-782`** — the account already had a registered subdomain, so wrangler did not prompt for a new one. Live URL: https://gil-bricks-app.gil-782.workers.dev
- **Public GitHub repository `gil-and-bricks/gil-bricks-app`** — as specified in the sprint brief; nothing secret is committed, and `.gitignore` covers `.env*`, `.dev.vars` and `.wrangler/`.
- **No Tailwind, no UI framework, no extra pages** — deliberately deferred; this sprint is only proving the build-and-deploy pipeline end to end.
