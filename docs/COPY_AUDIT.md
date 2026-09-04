# Copy audit — Sprint N5

Every visible string in the app, measured before and after the plain-English pass.
Measured with a one-off extractor: a babel walk over the strategy configs, the
tooltips, the web copy configs, and every user-facing string still inline in a
component or layout. The numbers below are its output.

**What the table does NOT include:** prose in `src/pages/**` (the landing,
area-data, extension, legal and placeholder pages). Page prose was audited by
rendering every page in a browser instead — `npm run verify:copy` walks eleven
surfaces and fails on any visible block over 30 words — and the page blocks that
broke the rule were shortened in this sprint too (area-data's intro and privacy
note, and three blocks on the extension page). Legal pages are exempt.

The RULES this measured against are in CLAUDE.md → "Copy rules" and are enforced
from now on by `packages/web/src/config/copy.test.ts` (source) and
`packages/web/scripts/check-copy-length.mjs` (the rendered app).

## The numbers

| | Before | After |
|---|---|---|
| Strings | 666 | 563 |
| Median reading grade (Flesch–Kincaid) | 4.8 | 3.7 |
| Mean words per string | 6.7 | 5.3 |
| Blocks over 30 words | 8 | 3 (all exempt: accordion bodies and licence text) |
| Blocks over 2 sentences | 3 | 2 (same) |
| Words on screen | 4492 | 3003 |

## The ten worst offenders found

| Words | Where | String |
|---:|---|---|
| 49 | `components/analyser/HmoVerdict.tsx` | Turning an ordinary house (class C3) into a small HMO (class C4, 3–6 people) is usually ‘permitted development’ — no planning application. But where t |
| 39 | `components/analyser/HmoVerdict.tsx` | Statutory minimums for licensed HMOs in England: 6.51 sqm for one adult, 10.22 sqm for two, 4.64 sqm for a child under 10 — under 4.64 sqm cannot be a |
| 38 | `components/area/AreaApp.tsx` | . Deprivation summarises official statistics on income, employment, health, education, crime, housing and environment for small areas — it says nothin |
| 38 | `components/area/AreaApp.tsx` | Raw counts carry no judgement about any street or person — compare areas by using the same radius. Totals reflect what each police force publishes to  |
| 37 | `components/site/Footer.astro` | Contains OS, Royal Mail and National Statistics data per the ONSPD licence. Deprivation: English Indices of Deprivation 2025 (MHCLG) and Welsh Index o |
| 33 | `config/nav.ts` | This is where the standalone calculators will live — stamp duty on its own, a rent-to-price check, a refurb budget sanity check — each one answering a |
| 32 | `components/analyser/ValuationCard.tsx` | Without the internal area we can’t show a price per square foot for this property. Type the size in square metres (it’s on the EPC) in the form above  |
| 32 | `config/nav.ts` | Nothing here is built yet, and we will never name or recommend a lender. The BRRRR and Flip analysers already model bridging costs inside a deal, so u |
| 30 | `components/analyser/CompMap.tsx` | Shaded areas have an Article 4 direction recorded in the national planning dataset (England). Coverage is incomplete and councils change these — alway |
| 29 | `components/analyser/HmoVerdict.tsx` | This works out the bricks-and-mortar value and room-by-room cashflow for small HMOs (up to 6 people). It does not estimate a commercial HMO valuation  |

## Deleted outright: the 39 "why this default" hints

Every assumption field printed a sentence justifying OUR default. None of them
helped you enter YOUR number, so all 39 were deleted (`whyDefault` is gone from
StrategyField). They are recorded here in full, so any of them can come back as a
tooltip line with one config edit.

| Field | Deleted hint |
|---|---|
| `core/strategies` | Around 5 weeks a year of empty periods is a common planning figure. |
| `core/strategies` | Full management typically costs 10–15% of rent; 12% is mid-range. Ignored when self-managing. |
| `core/strategies` | 1% of the purchase price a year is a standard upkeep rule of thumb. |
| `core/strategies` | A typical single-let policy runs £250–£400 a year. |
| `core/strategies` | Conveyancing plus a survey usually lands near £1,500. |
| `core/strategies` | Zero unless you know work is needed — it counts in your cash in. |
| `core/strategies` | Most landlords use interest-only; repayment modelling arrives later. |
| `core/strategies` | Lenders commonly stress-test at around 5.5% even when your pay rate is lower. |
| `core/strategies` | Most investors already own a home, so the additional-property rates apply. |
| `core/strategies` | Bridging lenders commonly advance around 75% of the purchase price. |
| `core/strategies` | Around 0.85% a month is a typical bridging rate as of 2026. |
| `core/strategies` | 2% of the loan is the standard arrangement fee. |
| `core/strategies` | Many bridges have no exit fee — check yours. |
| `core/strategies` | Conveyancing plus a survey usually lands near £1,500. |
| `core/strategies` | 10% of the refurb budget is the standard buffer for surprises. |
| `core/strategies` | Most flippers already earn into the higher band, so their flip profit is taxed there too. |
| `core/strategies` | Most flippers already own a home; buying through a company always pays the higher rates. |
| `core/strategies` | Bridging lenders commonly advance around 75% of the purchase price. |
| `core/strategies` | Around 0.85% a month is a typical bridging rate as of 2026. |
| `core/strategies` | 2% of the loan is the standard arrangement fee. |
| `core/strategies` | Many bridges have no exit fee — check yours. |
| `core/strategies` | Conveyancing plus a survey usually lands near £1,500. |
| `core/strategies` | A remortgage typically costs about £1,000 in legals and fees. |
| `core/strategies` | Around 5 weeks a year of empty periods is a common planning figure. |
| `core/strategies` | Full management typically costs 10–15% of rent. |
| `core/strategies` | 1% of the property value a year is a standard upkeep rule of thumb. |
| `core/strategies` | A typical single-let policy runs £250–£400 a year. |
| `core/strategies` | A mid-range buy-to-let remortgage rate as of 2026. |
| `core/strategies` | Lenders commonly stress-test at around 5.5%. |
| `core/strategies` | Most investors already own a home. |
| `core/strategies` | HMO lenders usually want at least 25%. |
| `core/strategies` | HMO products typically cost ~1% more than standard buy-to-let as of 2026. |
| `core/strategies` | Bills, broadband, cleaning, voids, maintenance and insurance typically absorb ~23% when you manage it yourself. |
| `core/strategies` | Add full management to bills, broadband, cleaning, voids, maintenance and insurance and ~40% of room income is a realistic planning figure. |
| `core/strategies` | Councils typically charge £1,000–£1,500 for a five-year licence. |
| `core/strategies` | Annual servicing and certificates for a small HMO usually total ~£600. |
| `core/strategies` | Conveyancing plus a survey usually lands near £1,500. |
| `core/strategies` | Lenders commonly stress-test at around 5.5%. |
| `core/strategies` | Most investors already own a home. |

## Every string, with what happened to it

Action: **keep** (already short), **shorten / move to config**, **delete**,
**keep (exempt)** = over 30 words on purpose, inside a collapsed accordion or a
licence attribution.

| Words | Sentences | Grade | Where | Kind | String | Action |
|---:|---:|---:|---|---|---|---|
| 49 | 3 | 10.7 | `components/analyser/HmoVerdict.tsx` | inline | Turning an ordinary house (class C3) into a small HMO (class C4, 3–6 people) is usually ‘permitted development’ — no planning application. But where the council has made an Article | keep (exempt) |
| 39 | 2 | 9.1 | `components/analyser/HmoVerdict.tsx` | inline | Statutory minimums for licensed HMOs in England: 6.51 sqm for one adult, 10.22 sqm for two, 4.64 sqm for a child under 10 — under 4.64 sqm cannot be a bedroom at all. Councils can  | keep (exempt) |
| 38 | 1 | 20.5 | `components/area/AreaApp.tsx` | inline | . Deprivation summarises official statistics on income, employment, health, education, crime, housing and environment for small areas — it says nothing about any individual street  | shorten / move to config |
| 38 | 3 | 7.9 | `components/area/AreaApp.tsx` | inline | Raw counts carry no judgement about any street or person — compare areas by using the same radius. Totals reflect what each police force publishes to police.uk; some forces publish | shorten / move to config |
| 37 | 3 | 10.5 | `components/site/Footer.astro` | inline | Contains OS, Royal Mail and National Statistics data per the ONSPD licence. Deprivation: English Indices of Deprivation 2025 (MHCLG) and Welsh Index of Multiple Deprivation 2025 (W | keep (exempt) |
| 33 | 1 | 15.6 | `config/nav.ts` | body | This is where the standalone calculators will live — stamp duty on its own, a rent-to-price check, a refurb budget sanity check — each one answering a single question without filli | shorten / move to config |
| 32 | 2 | 5.6 | `components/analyser/ValuationCard.tsx` | inline | Without the internal area we can’t show a price per square foot for this property. Type the size in square metres (it’s on the EPC) in the form above to unlock it. | shorten / move to config |
| 32 | 2 | 7.6 | `config/nav.ts` | body | Nothing here is built yet, and we will never name or recommend a lender. The BRRRR and Flip analysers already model bridging costs inside a deal, so use those in the meantime. | shorten / move to config |
| 30 | 2 | 10.5 | `components/analyser/CompMap.tsx` | inline | Shaded areas have an Article 4 direction recorded in the national planning dataset (England). Coverage is incomplete and councils change these — always confirm with the council bef | shorten / move to config |
| 29 | 2 | 6.8 | `components/analyser/HmoVerdict.tsx` | inline | This works out the bricks-and-mortar value and room-by-room cashflow for small HMOs (up to 6 people). It does not estimate a commercial HMO valuation — those need a surveyor. | shorten / move to config |
| 29 | 2 | 6.7 | `components/area/AreaApp.tsx` | inline | We list every sale in the sector from the last 12 months in price order, set aside the cheapest quarter and the dearest quarter, and average the rest. With | keep |
| 29 | 1 | 13.0 | `config/nav.ts` | body | This is where bridging and development finance guidance will live: what the costs actually are, how lenders read a deal, and how to sanity-check a quote before you commit. | shorten / move to config |
| 27 | 2 | 6.0 | `components/analyser/ValuationCard.tsx` | inline | We couldn’t reach HM Land Registry just now, so we can’t use this exact property’s own past sale. The estimate below still leans on nearby sold prices. | shorten / move to config |
| 25 | 2 | 5.8 | `components/auth/LoginWall.tsx` | inline | Signing in and saving need cookies switched on in your browser. Your analysis is safe in this link — copy it so you don’t lose it. | shorten / move to config |
| 24 | 2 | 5.3 | `components/auth/LoginWall.tsx` | inline | The quick human check couldn't load. Existing users can sign in as normal; creating a NEW account needs it — reload the page to retry. | shorten / move to config |
| 23 | 2 | 4.8 | `config/nav.ts` | body | Nothing here is built yet. The full analyser already does all of this maths inside a deal, so use that in the meantime. | shorten / move to config |
| 22 | 1 | 8.0 | `components/analyser/BrrrrVerdict.tsx` | inline | Add the end value after works and the rent after works to get a verdict — the refurb budget and price help too. | shorten / move to config |
| 22 | 1 | 10.2 | `components/analyser/HmoVerdict.tsx` | inline | To check if a property is a licensed HMO, find your council at gov.uk/find-local-council and search its site for ‘HMO register’. | shorten / move to config |
| 22 | 1 | 11.1 | `content/microcopy.ts` | tooltip | The typical sold price: we drop the cheapest and dearest quarter of sales, then average the rest (the interquartile mean, IQM). | shorten / move to config |
| 21 | 1 | 10.0 | `components/analyser/AnalyserApp.tsx` | inline | Start with the postcode and the asking price, then pick the property type — everything else has sensible defaults you can change. | shorten / move to config |
| 21 | 2 | 6.3 | `components/analyser/FlipVerdict.tsx` | inline | Buy-refurb-sell for profit is normally taxed as trading income, not capital gains. This is not tax advice — check with an accountant. | shorten / move to config |
| 21 | 2 | 4.3 | `components/deals/DealBoard.tsx` | inline | Deals show up here when you analyse a listing — there’s no “add a property” button by design. Run one through an | shorten / move to config |
| 21 | 2 | 2.6 | `content/microcopy.ts` | tooltip | Price per square foot of floor space — a fair way to compare homes of different sizes. Needs a known floor area. | shorten / move to config |
| 21 | 1 | 12.3 | `core/strategies` | whyDefault | Add full management to bills, broadband, cleaning, voids, maintenance and insurance and ~40% of room income is a realistic planning figure. | delete |
| 20 | 1 | 9.8 | `components/area/AreaApp.tsx` | inline | . That usually means a very thin market rather than a problem with the postcode — try the surroundings below, or | shorten / move to config |
| 20 | 2 | 1.9 | `config/pipeline.ts` | x | You’ve got 100 live deals. Kill the ones that are dead — that frees a slot, and the reason gets remembered. | shorten / move to config |
| 20 | 1 | 9.1 | `core/strategies` | tip | A small HMO (House in Multiple Occupation) is a shared home for 3–6 unrelated people (planning class C4). | shorten / move to config |
| 20 | 1 | 10.5 | `core/strategies` | tip | Find local room rates yourself: ask letting agents what rooms actually let for, and check what similar rooms advertise at. | shorten / move to config |
| 19 | 1 | 10.5 | `components/analyser/BrrrrVerdict.tsx` | inline | ) — it reflects typical sold condition for the area; raise it only if your finish will clearly beat local stock. | shorten / move to config |
| 19 | 1 | 10.5 | `components/analyser/FlipVerdict.tsx` | inline | ) — it reflects typical sold condition for the area; raise it only if your finish will clearly beat local stock. | shorten / move to config |
| 19 | 1 | 12.4 | `components/analyser/HmoVerdict.tsx` | inline | Tenants paying their own bills usually cuts your operating costs — lower the operating % in the assumptions to match. | shorten / move to config |
| 19 | 1 | 9.8 | `components/analyser/ValuationCard.tsx` | inline | Not enough evidence yet — add the internal area, or a house number so we can find its sale history. | shorten / move to config |
| 19 | 2 | 4.9 | `content/microcopy.ts` | tooltip | Tick to get property tips and updates by email. Untick any time — we tell our email provider to stop. | shorten / move to config |
| 18 | 1 | 9.9 | `components/analyser/AnalyserApp.tsx` | inline | This tool only has sold-price data for England & Wales, so we can’t analyse Scottish or Northern Irish postcodes. | shorten / move to config |
| 18 | 2 | 6.1 | `components/analyser/AnalyserApp.tsx` | inline | Something went wrong fetching sold prices for this search — it’s usually temporary. Please try again in a moment. | shorten / move to config |
| 18 | 1 | 7.3 | `components/analyser/TransactionDetail.tsx` | inline | This link doesn’t point to a specific sale — go back to the comparables list and pick a row. | shorten / move to config |
| 18 | 1 | 11.2 | `components/area/AreaApp.tsx` | inline | . Statisticians call this the interquartile mean — it stops one mansion or one bargain dragging the number around. | keep |
| 18 | 1 | 7.8 | `components/area/AreaApp.tsx` | inline | -wide index, not a local one — local sold prices above are the better guide to this exact area. | shorten / move to config |
| 18 | 1 | 8.6 | `components/area/AreaApp.tsx` | inline | We don’t have a deprivation score matched to this postcode sector — everything else on this page still holds. | shorten / move to config |
| 18 | 2 | 6.9 | `components/auth/AccountApp.tsx` | inline | Removes your account and saved deals, and queues an unsubscribe to our email provider. This cannot be undone. | shorten / move to config |
| 18 | 2 | 2.3 | `components/auth/LoginWall.tsx` | inline | Free forever — sign in to save deals to My deals and share them. (PDF export is coming soon.) | shorten / move to config |
| 18 | 2 | 6.7 | `content/microcopy.ts` | tooltip | The inside floor area in square metres. You’ll find it on the property’s EPC (Energy Performance Certificate). | keep |
| 18 | 2 | 3.7 | `content/microcopy.ts` | tooltip | The official UK House Price Index for the whole country. It shows the trend, not this exact street. | keep |
| 18 | 2 | 3.6 | `content/microcopy.ts` | tooltip | Flood warnings in force right now only. It says nothing about the long-term flood risk of the property. | keep |
| 18 | 1 | 5.4 | `content/microcopy.ts` | tooltip | 8 in 10 nearby sales fell in this range — the cheapest tenth and dearest tenth are left out. | keep |
| 18 | 1 | 10.4 | `core/strategies` | tip | Most buyers’ lenders won’t mortgage a property resold within 6 months of purchase — plan the timeline around it. | keep |
| 17 | 1 | 9.8 | `components/analyser/AnalyserApp.tsx` | inline | We haven’t built the verdict for this strategy yet — the sold comparables and valuation below still work. | shorten / move to config |
| 17 | 2 | 4.9 | `components/analyser/TransactionDetail.tsx` | inline | We couldn’t load this sold record just now — it’s usually temporary. Please try again in a moment. | shorten / move to config |
| 17 | 1 | 10.6 | `components/area/AreaApp.tsx` | inline | Comparing with everything sold within 1 mile of this postcode — the wider sweep takes a moment longer… | shorten / move to config |
| 17 | 1 | 8.6 | `components/area/AreaApp.tsx` | inline | The house-price trend isn’t available right now — the sold prices above are the better local guide anyway. | shorten / move to config |
| 17 | 1 | 6.3 | `components/area/AreaApp.tsx` | inline | The full 1-mile list was too large to fetch, so these numbers cover roughly half a mile. | shorten / move to config |
| 17 | 1 | 4.9 | `components/auth/AccountApp.tsx` | inline | Your saved deals live here once you’re signed in — it’s free and takes one tap with Google. | shorten / move to config |
| 17 | 2 | 7.2 | `content/microcopy.ts` | tooltip | An official government score ranking areas by income, jobs, health and education. Not about any one street. | keep |
| 17 | 1 | 10.6 | `core/strategies` | tip | The pretend higher interest rate a lender checks the room income against (ICR = interest cover ratio). | keep |
| 16 | 1 | 4.5 | `components/deals/DealBoard.tsx` | inline | Your deals live here once you’re signed in — it’s free and takes one tap with Google. | shorten / move to config |
| 16 | 2 | 2.3 | `content/microcopy.ts` | tooltip | The house number or name. It lets us look up this property’s own past sale prices. | keep |
| 16 | 1 | 8.4 | `content/microcopy.ts` | tooltip | The middle of what actually sold near here recently — not asking prices, which are often higher. | keep |
| 16 | 2 | 3.8 | `content/microcopy.ts` | tooltip | Every sale within a mile shown on the map. Tap a dot to see that sale. | keep |
| 16 | 1 | 9.9 | `core/strategies` | tip | The pretend higher interest rate a lender checks the rent against (ICR = interest cover ratio). | keep |
| 16 | 1 | 5.2 | `core/strategies` | tip | What it should sell for once the works are done — the gross development value (GDV). | keep |
| 16 | 1 | 6.9 | `core/strategies` | whyDefault | Most flippers already earn into the higher band, so their flip profit is taxed there too. | delete |
| 16 | 1 | 9.9 | `core/strategies` | tip | The pretend higher interest rate a lender checks the rent against (ICR = interest cover ratio). | keep |
| 16 | 2 | 6.0 | `core/strategies` | tip | Most rooms let all-inclusive. If tenants pay bills, lower the operating % in assumptions to match. | keep |
| 15 | 1 | 4.2 | `components/analyser/BrrrrVerdict.tsx` | inline | the highest price at which money left in is £0, solved against the same maths | keep |
| 15 | 1 | 5.9 | `components/analyser/HmoVerdict.tsx` | inline | 7 or more people is a large ‘sui generis’ HMO — outside what this tool covers. | shorten / move to config |
| 15 | 1 | 9.9 | `components/area/AreaApp.tsx` | inline | Uses Environment Agency flood and river level data from the real-time data API (Beta). | shorten / move to config |
| 15 | 1 | 9.9 | `components/area/AreaApp.tsx` | inline | Uses Environment Agency flood and river level data from the real-time data API (Beta). | shorten / move to config |
| 15 | 2 | 3.0 | `components/auth/AccountApp.tsx` | inline | You’re on the list — we’ll email you when there’s something worth sending. Untick any time. | shorten / move to config |
| 15 | 2 | 2.3 | `content/microcopy.ts` | tooltip | The property’s full postcode, like CF37 1HR. We use it to find nearby sold prices. | keep |
| 15 | 1 | 3.6 | `content/microcopy.ts` | tooltip | Roughly how much work it needs before you could let it out or sell it. | keep |
| 15 | 1 | 8.4 | `content/microcopy.ts` | tooltip | How many homes actually completed a sale each month here, from HM Land Registry records. | keep |
| 15 | 1 | 7.6 | `content/microcopy.ts` | tooltip | Crimes the police recorded near this postcode in one month, from the official police.uk data. | keep |
| 15 | 1 | 8.4 | `core/strategies` | whyDefault | Most flippers already own a home; buying through a company always pays the higher rates. | delete |
| 15 | 1 | 4.4 | `core/strategies` | tip | What it should be worth once the works are done — the after-repair value (ARV). | keep |
| 15 | 2 | 3.0 | `core/strategies` | tip | Your own loan-to-value (LTV): the loan as a % of the property value. E.g. 78.9. | keep |
| 15 | 1 | 12.6 | `core/strategies` | whyDefault | Bills, broadband, cleaning, voids, maintenance and insurance typically absorb ~23% when you manage it yourself. | delete |
| 15 | 1 | 13.3 | `core/strategies` | tip | Fire-alarm servicing, an electrical safety certificate (EICR), a gas-safety check and a fire-risk assessment. | keep |
| 14 | 1 | 5.9 | `components/analyser/FlipVerdict.tsx` | inline | Add the refurb budget and the sale price after works to get a verdict. | shorten / move to config |
| 14 | 1 | 1.3 | `components/area/AreaApp.tsx` | inline | of 10, where 1 is the most deprived tenth and 10 the least). | keep |
| 14 | 2 | 4.0 | `components/deals/DealBoard.tsx` | inline | ⚠ Auction — read the legal pack before you bid. Fees and a fixed completion apply. | shorten / move to config |
| 14 | 2 | 6.9 | `core/strategies` | whyDefault | Full management typically costs 10–15% of rent; 12% is mid-range. Ignored when self-managing. | delete |
| 14 | 1 | 5.8 | `core/strategies` | whyDefault | 1% of the purchase price a year is a standard upkeep rule of thumb. | delete |
| 14 | 1 | 7.6 | `core/strategies` | whyDefault | 1% of the property value a year is a standard upkeep rule of thumb. | delete |
| 13 | 1 | 5.0 | `components/analyser/BrrrrVerdict.tsx` | inline | These numbers don’t work together — check the price, end value, LTV and rent. | shorten / move to config |
| 13 | 1 | 8.4 | `components/analyser/BtlVerdict.tsx` | inline | These numbers don’t work together — check the deposit, rate, rent and assumption values. | shorten / move to config |
| 13 | 1 | 6.7 | `components/analyser/FlipVerdict.tsx` | inline | These numbers don’t work together — check the price, sale price and refurb values. | shorten / move to config |
| 13 | 1 | 3.1 | `components/analyser/FlipVerdict.tsx` | inline | the highest price that keeps the flip Green, solved against the same maths | keep |
| 13 | 1 | 7.6 | `components/analyser/ValuationCard.tsx` | inline | Beds, baths, garden and parking are context only — they never adjust the numbers. | shorten / move to config |
| 13 | 1 | 7.8 | `core/strategies` | whyDefault | Around 5 weeks a year of empty periods is a common planning figure. | delete |
| 13 | 1 | 4.0 | `core/strategies` | whyDefault | Zero unless you know work is needed — it counts in your cash in. | delete |
| 13 | 1 | 7.6 | `core/strategies` | whyDefault | Lenders commonly stress-test at around 5.5% even when your pay rate is lower. | delete |
| 13 | 1 | 6.7 | `core/strategies` | tip | Most lenders want you to have owned it about six months before refinancing. | keep |
| 13 | 1 | 7.8 | `core/strategies` | whyDefault | Around 5 weeks a year of empty periods is a common planning figure. | delete |
| 12 | 1 | 4.9 | `components/analyser/CompsModule.tsx` | inline | The list view carries the same data for keyboard and screen-reader use. | shorten / move to config |
| 12 | 1 | 12.2 | `components/analyser/FlipVerdict.tsx` | inline | Buying through a company always pays the higher purchase-tax rates — applied automatically. | shorten / move to config |
| 12 | 1 | 4.9 | `components/analyser/HmoVerdict.tsx` | inline | These numbers don’t work together — check the price, rooms and rent values. | shorten / move to config |
| 12 | 1 | 6.8 | `components/area/AreaApp.tsx` | inline | Something went wrong loading the data — please try again in a moment. | keep |
| 12 | 1 | 3.1 | `content/microcopy.ts` | tooltip | The asking price, or the price you’ve agreed to pay, in pounds. | keep |
| 12 | 1 | 5.8 | `content/microcopy.ts` | tooltip | Detached, semi-detached, terraced or a flat — used to compare like with like. | keep |
| 12 | 2 | 5.4 | `content/microcopy.ts` | tooltip | Number of bedrooms. Shown for context only — it never changes the valuation. | keep |
| 12 | 1 | 4.9 | `core/strategies` | tip | An agent takes a slice of the rent; self-managing takes your time. | keep |
| 12 | 2 | 1.5 | `core/strategies` | tagline | Will it wash its face? Yield, cashflow and value in one place. | keep |
| 12 | 1 | 4.8 | `core/strategies` | tip | Changes how the profit is taxed — both scenarios are shown either way. | keep |
| 12 | 1 | 4.8 | `core/strategies` | whyDefault | Around 0.85% a month is a typical bridging rate as of 2026. | delete |
| 12 | 1 | 4.8 | `core/strategies` | whyDefault | Around 0.85% a month is a typical bridging rate as of 2026. | delete |
| 12 | 1 | 6.8 | `core/strategies` | tip | HMO management is real work — rooms turn over faster than whole houses. | keep |
| 12 | 1 | 5.8 | `core/strategies` | whyDefault | HMO products typically cost ~1% more than standard buy-to-let as of 2026. | delete |
| 11 | 1 | 4.8 | `components/analyser/AnalyserApp.tsx` | inline | Watch the free walkthrough for on YouTube (opens a new tab) | keep |
| 11 | 1 | 3.7 | `components/analyser/BrrrrVerdict.tsx` | inline | the smallest end value at which money left in is £0 | keep |
| 11 | 1 | 6.9 | `components/analyser/CompMap.tsx` | inline | The map couldn't display here — the table below has every sale. | keep |
| 11 | 1 | 8.0 | `components/analyser/CompMap.tsx` | inline | Map of comparable sales — the table view carries the same data | keep |
| 11 | 1 | 6.9 | `components/analyser/CompsModule.tsx` | inline | Untick a row to leave it out — the stats recalculate instantly. | shorten / move to config |
| 11 | 1 | 9.1 | `components/analyser/FlipVerdict.tsx` | inline | Taking the money out of the company personally is taxed again. | keep |
| 11 | 1 | 4.8 | `components/area/AreaApp.tsx` | inline | in the last 12 months — treat every number here with caution. | keep |
| 11 | 1 | 12.3 | `components/area/AreaApp.tsx` | inline | The 1-mile comparison isn't available right now — everything above still is. | keep |
| 11 | 1 | 9.1 | `components/area/AreaApp.tsx` | inline | Not enough sales in the surrounding mile for a fair comparison. | keep |
| 11 | 1 | 8.0 | `components/area/AreaApp.tsx` | inline | Live flood alerts for Wales are published by Natural Resources Wales — | keep |
| 11 | 1 | 3.7 | `components/auth/AccountApp.tsx` | inline | Couldn't load your deals just now — refresh the page to retry. | keep |
| 11 | 1 | 5.8 | `components/deals/DealBoard.tsx` | inline | Couldn’t load your pipeline just now — refresh the page to retry. | keep |
| 11 | 1 | 5.9 | `config/pipeline.ts` | blurb | Chasing the figures that firm up the estimate — rent, refurb, quotes. | keep |
| 11 | 1 | 10.7 | `core/strategies` | whyDefault | Most investors already own a home, so the additional-property rates apply. | delete |
| 11 | 1 | 2.9 | `core/strategies` | heroLine | Stress-test a flip with real local sold prices and honest ranges. | keep |
| 11 | 1 | 6.0 | `core/strategies` | whyDefault | 10% of the refurb budget is the standard buffer for surprises. | delete |
| 11 | 2 | 5.9 | `core/strategies` | tip | A second property pays the higher rates. Companies always pay them. | keep |
| 11 | 1 | 3.7 | `core/strategies` | heroLine | Analyse a small HMO deal on real sold prices — no guesswork. | keep |
| 11 | 1 | 10.7 | `core/strategies` | whyDefault | Annual servicing and certificates for a small HMO usually total ~£600. | delete |
| 10 | 1 | 4.8 | `components/analyser/AnalyserApp.tsx` | inline | Start with a postcode to see what recently sold nearby. | shorten / move to config |
| 10 | 1 | 4.8 | `components/analyser/SubjectForm.tsx` | inline | From the EPC match for this address — edit to override. | keep |
| 10 | 2 | -0.7 | `components/analyser/ValuationCard.tsx` | inline | Which address is it? We found more than one match: | keep |
| 10 | 1 | 4.8 | `components/analyser/mapImpl.ts` | inline | <p class="map-popup-link"><a href="/transaction?id=">Details →</a></p> | keep |
| 10 | 1 | 4.8 | `config/nav.ts` | tagline | How the money side gets funded — bridging, refurb and exit. | keep |
| 10 | 1 | 4.8 | `config/pipeline.ts` | blurb | Not proceeding — kept as memory of why it didn’t work. | keep |
| 10 | 2 | 2.6 | `content/microcopy.ts` | tooltip | Off-street parking spaces, like a drive or garage. Context only. | keep |
| 10 | 1 | 5.0 | `core/strategies` | tip | Your cash share of the price — lenders usually want 25%. | keep |
| 10 | 1 | 4.8 | `core/strategies` | tip | Interest-only keeps payments low; the loan is not paid down. | keep |
| 10 | 1 | 8.9 | `core/strategies` | whyDefault | Bridging lenders commonly advance around 75% of the purchase price. | delete |
| 10 | 1 | 7.2 | `core/strategies` | heroLine | See whether the refinance really pulls your money back out. | keep |
| 10 | 1 | 3.7 | `core/strategies` | tip | The share of the end value the new mortgage advances. | keep |
| 10 | 1 | 8.9 | `core/strategies` | whyDefault | Bridging lenders commonly advance around 75% of the purchase price. | delete |
| 10 | 1 | 8.9 | `core/strategies` | whyDefault | A remortgage typically costs about £1,000 in legals and fees. | delete |
| 9 | 1 | 8.4 | `components/analyser/AnalyserApp.tsx` | inline | Brought over from the extension — everything’s filled in below. | shorten / move to config |
| 9 | 1 | 6.0 | `components/analyser/BrrrrVerdict.tsx` | inline | Enter your custom loan-to-value % to get a verdict. | shorten / move to config |
| 9 | 1 | 9.6 | `components/analyser/BrrrrVerdict.tsx` | inline | Ambitious — get a broker’s opinion before relying on it. | keep |
| 9 | 1 | 10.2 | `components/analyser/BrrrrVerdict.tsx` | inline | your ceiling for offers if pulling everything out matters | keep |
| 9 | 1 | 1.0 | `components/analyser/CompsModule.tsx` | inline | No sold prices matched this search near this postcode. | shorten / move to config |
| 9 | 1 | 9.6 | `components/analyser/FlipVerdict.tsx` | inline | Ambitious — get a broker’s opinion before relying on it. | keep |
| 9 | 1 | 2.3 | `components/analyser/FlipVerdict.tsx` | inline | the smallest sale price that makes the flip Green | keep |
| 9 | 1 | 1.0 | `components/analyser/HmoVerdict.tsx` | inline | Add the rent per room to get a verdict. | shorten / move to config |
| 9 | 1 | 2.3 | `components/area/AreaApp.tsx` | inline | No recorded sales here in the last 12 months | keep |
| 9 | 1 | 14.1 | `components/area/AreaApp.tsx` | inline | Live flood data unavailable right now (Environment Agency). | keep |
| 9 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | in or near this area (within about 3 miles): | keep |
| 9 | 1 | 7.2 | `components/area/AreaApp.tsx` | inline | Find your local council — HMO and licensing questions (GOV.UK) | keep |
| 9 | 1 | 5.0 | `components/area/AreaApp.tsx` | inline | These are official services — we link, we don't copy. | keep |
| 9 | 1 | 2.5 | `config/pipeline.ts` | blurb | A deal you’ve sent over that looks worth checking. | keep |
| 9 | 1 | 8.2 | `core/strategies` | whyDefault | A typical single-let policy runs £250–£400 a year. | delete |
| 9 | 1 | 3.7 | `core/strategies` | heroLine | Check any England & Wales buy-to-let against real sold prices. | keep |
| 9 | 1 | 5.2 | `core/strategies` | whyDefault | 2% of the loan is the standard arrangement fee. | delete |
| 9 | 1 | 5.0 | `core/strategies` | tip | Flip profit stacks on top of your other income. | keep |
| 9 | 1 | 6.3 | `core/strategies` | tagline | Buy, refurbish, rent, refinance, repeat — how much stays in? | keep |
| 9 | 1 | 5.2 | `core/strategies` | whyDefault | 2% of the loan is the standard arrangement fee. | delete |
| 9 | 1 | 8.2 | `core/strategies` | whyDefault | A typical single-let policy runs £250–£400 a year. | delete |
| 9 | 1 | 3.7 | `core/strategies` | tip | Fire doors, locks, en-suites — HMO conversions cost real money. | keep |
| 9 | 1 | 6.3 | `core/strategies` | tip | Licences run five years and are budgeted yearly here. | shorten / move to config |
| 9 | 1 | 8.2 | `core/strategies` | whyDefault | Councils typically charge £1,000–£1,500 for a five-year licence. | delete |
| 8 | 1 | 4.0 | `components/analyser/BrrrrVerdict.tsx` | inline | end value , LTV, your fees and refurb | keep |
| 8 | 1 | 8.2 | `components/analyser/BrrrrVerdict.tsx` | inline | compare it with our estimate before believing it | keep |
| 8 | 1 | 2.3 | `components/analyser/BtlVerdict.tsx` | inline | Add the monthly rent to get a verdict. | shorten / move to config |
| 8 | 1 | 8.2 | `components/analyser/CompsModule.tsx` | inline | nearby — treat the typical figures below with caution. | keep |
| 8 | 1 | 5.7 | `components/analyser/FlipVerdict.tsx` | inline | sale price , your costs and tax scenario | keep |
| 8 | 1 | 5.2 | `components/analyser/FlipVerdict.tsx` | inline | only believe it if the sold evidence does | keep |
| 8 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | HM Land Registry has no sales for sector | shorten / move to config |
| 8 | 1 | -0.7 | `components/auth/AccountApp.tsx` | inline | now — it shows which one needs you next. | keep |
| 8 | 2 | 2.2 | `components/auth/AccountApp.tsx` | inline | Nothing saved yet. Run a property through any | keep |
| 8 | 1 | 1.0 | `config/pipeline.ts` | blurb | You’re booked in or planning to see it. | keep |
| 8 | 1 | 6.7 | `config/pipeline.ts` | blurb | Offer agreed — into the legal and survey work. | keep |
| 8 | 1 | 9.1 | `core/strategies` | whyDefault | Conveyancing plus a survey usually lands near £1,500. | delete |
| 8 | 1 | 12.8 | `core/strategies` | whyDefault | Most landlords use interest-only; repayment modelling arrives later. | delete |
| 8 | 1 | 6.3 | `core/strategies` | tip | A second property pays the higher stamp-duty rates. | keep |
| 8 | 1 | 5.2 | `core/strategies` | tagline | Buy, refurbish, sell — is the margin really there? | keep |
| 8 | 1 | 0.8 | `core/strategies` | tip | The share of the price the bridge advances. | keep |
| 8 | 1 | 3.8 | `core/strategies` | whyDefault | Many bridges have no exit fee — check yours. | delete |
| 8 | 1 | 9.1 | `core/strategies` | whyDefault | Conveyancing plus a survey usually lands near £1,500. | delete |
| 8 | 1 | 0.8 | `core/strategies` | tip | The share of the price the bridge advances. | keep |
| 8 | 1 | 3.8 | `core/strategies` | whyDefault | Many bridges have no exit fee — check yours. | delete |
| 8 | 1 | 9.1 | `core/strategies` | whyDefault | Conveyancing plus a survey usually lands near £1,500. | delete |
| 8 | 1 | 10.4 | `core/strategies` | whyDefault | Full management typically costs 10–15% of rent. | delete |
| 8 | 1 | 2.5 | `core/strategies` | whyDefault | A mid-range buy-to-let remortgage rate as of 2026. | delete |
| 8 | 1 | 6.3 | `core/strategies` | tip | A second property pays the higher stamp-duty rates. | keep |
| 8 | 1 | 9.1 | `core/strategies` | whyDefault | Conveyancing plus a survey usually lands near £1,500. | delete |
| 8 | 1 | 6.3 | `core/strategies` | tip | A second property pays the higher stamp-duty rates. | keep |
| 7 | 1 | 2.3 | `components/analyser/BrrrrVerdict.tsx` | inline | End value needed for all money out | keep |
| 7 | 1 | 2.5 | `components/analyser/BrrrrVerdict.tsx` | inline | price , LTV, your fees and refurb | keep |
| 7 | 1 | 10.7 | `components/analyser/FlipVerdict.tsx` | inline | your negotiating ceiling if the margin matters | keep |
| 7 | 1 | 4.5 | `components/analyser/FlipVerdict.tsx` | inline | price , your costs and tax scenario | keep |
| 7 | 1 | 0.6 | `components/analyser/SubjectForm.tsx` | inline | No EPC match found for this address. | keep |
| 7 | 1 | 0.5 | `components/analyser/ValuationCard.tsx` | inline | Add the floor area for £/sqft | shorten / move to config |
| 7 | 1 | 2.3 | `components/area/AreaApp.tsx` | inline | How is the typical price worked out? | keep |
| 7 | 1 | 5.7 | `components/area/AreaApp.tsx` | inline | from each end and averaging the middle | keep |
| 7 | 1 | 9.1 | `components/area/AreaApp.tsx` | inline | Crime data unavailable right now (police.uk). | keep |
| 7 | 1 | 4.0 | `components/area/AreaApp.tsx` | inline | No current flood alerts in this area. | keep |
| 7 | 1 | 0.8 | `components/area/AreaApp.tsx` | inline | check long-term flood risk for this postcode ( | keep |
| 7 | 1 | 4.5 | `components/area/AreaApp.tsx` | inline | Monthly sales over the 12 months to : | keep |
| 7 | 1 | 0.6 | `components/auth/AccountApp.tsx` | inline | That did not save — please try again. | keep |
| 7 | 1 | 0.6 | `components/auth/AccountApp.tsx` | inline | That did not save — please try again. | keep |
| 7 | 1 | 5.7 | `components/auth/AccountApp.tsx` | inline | Send me property deals & updates by email | keep |
| 7 | 1 | 5.7 | `components/auth/LoginWall.tsx` | inline | Send me property deals & updates by email | keep |
| 7 | 2 | -0.8 | `components/deals/DealBoard.tsx` | inline | That didn’t move — put back. Try again. | keep |
| 7 | 2 | -0.8 | `components/deals/DealBoard.tsx` | inline | That didn’t save — put back. Try again. | keep |
| 7 | 1 | 0.5 | `components/deals/DealBoard.tsx` | inline | , or send one over with the | shorten / move to config |
| 7 | 1 | 11.1 | `components/site/Header.astro` | inline | ${siteConfig.makerName} on Instagram (opens a new tab) | keep |
| 7 | 1 | 11.1 | `components/site/Header.astro` | inline | ${siteConfig.makerName} on YouTube (opens a new tab) | keep |
| 7 | 1 | 0.6 | `config/analyserSections.ts` | navLabel | Jump to a section on this page | keep |
| 7 | 1 | 7.4 | `config/nav.ts` | tagline | Small calculators that answer one question each. | keep |
| 7 | 1 | 0.6 | `config/pipeline.ts` | todo | Get the numbers that firm it up | keep |
| 7 | 1 | 2.3 | `config/pipeline.ts` | blurb | You’ve made an offer and are waiting. | keep |
| 7 | 1 | 2.5 | `config/pipeline.ts` | tooManyRooms | a smaller HMO (6 rooms or fewer) | keep |
| 7 | 2 | 4.3 | `config/pipeline.ts` | tickingAlong | Nothing needs you today. deal ticking along. | keep |
| 7 | 2 | 4.3 | `content/microcopy.ts` | tooltip | Number of bathrooms. Shown for context only. | keep |
| 7 | 2 | 2.6 | `content/microcopy.ts` | tooltip | Roughly when it was built. Context only. | keep |
| 7 | 2 | 4.3 | `content/microcopy.ts` | tooltip | Whether it has a garden. Context only. | keep |
| 7 | 1 | -1.1 | `core/strategies` | tip | What it would let for each month. | keep |
| 7 | 1 | 2.3 | `core/strategies` | tip | Changes how the rental profit is taxed. | keep |
| 7 | 1 | 0.6 | `core/strategies` | name | Return on the cash you put in | keep |
| 7 | 1 | 4.0 | `core/strategies` | tip | What the selling agent charges, before VAT. | keep |
| 7 | 1 | -1.1 | `core/strategies` | tip | Some bridges charge on the way out. | keep |
| 7 | 1 | 0.6 | `core/strategies` | name | Return on the cash you put in | keep |
| 7 | 1 | 2.3 | `core/strategies` | tip | What it will let for once refurbished. | keep |
| 7 | 1 | 2.3 | `core/strategies` | tip | Changes how the rental profit is taxed. | keep |
| 7 | 1 | -1.1 | `core/strategies` | tip | Some bridges charge on the way out. | keep |
| 7 | 1 | 4.0 | `core/strategies` | tip | The remortgage has its own legal work. | keep |
| 7 | 1 | 7.4 | `core/strategies` | tip | Yearly upkeep budget on the end value. | keep |
| 7 | 1 | 6.3 | `core/strategies` | tagline | Room-by-room income against the real local evidence. | keep |
| 7 | 1 | 2.3 | `core/strategies` | tip | Changes how the rental profit is taxed. | keep |
| 7 | 1 | 4.5 | `core/strategies` | whyDefault | HMO lenders usually want at least 25%. | delete |
| 7 | 1 | 4.0 | `core/strategies` | tip | HMO mortgages price higher than single lets. | keep |
| 7 | 1 | 4.0 | `core/strategies` | tip | Everything it costs to run the rooms. | keep |
| 7 | 1 | 0.6 | `core/strategies` | name | Return on the cash you put in | keep |
| 6 | 1 | 0.5 | `components/analyser/ActionBar.tsx` | inline | That didn't save — please try again. | keep |
| 6 | 1 | 0.5 | `components/analyser/ActionBar.tsx` | inline | That didn't save — please try again. | keep |
| 6 | 1 | 4.0 | `components/analyser/BrrrrVerdict.tsx` | inline | End value pre-filled from our estimate ( | shorten / move to config |
| 6 | 1 | 0.5 | `components/analyser/BrrrrVerdict.tsx` | inline | Max price for all money out | keep |
| 6 | 1 | 0.5 | `components/analyser/BrrrrVerdict.tsx` | inline | Max price for all money out | keep |
| 6 | 1 | -2.2 | `components/analyser/DealScore.tsx` | inline | Deal score out of 10 — . | keep |
| 6 | 1 | 4.0 | `components/analyser/FlipVerdict.tsx` | inline | Sale price pre-filled from our estimate ( | shorten / move to config |
| 6 | 1 | 0.5 | `components/analyser/FlipVerdict.tsx` | inline | Max offer for a Green flip | keep |
| 6 | 1 | 2.5 | `components/analyser/HmoVerdict.tsx` | inline | Check your room sizes are legal | keep |
| 6 | 1 | 2.5 | `components/analyser/SubjectForm.tsx` | inline | EPC says sqm — your figure kept. | keep |
| 6 | 1 | 12.3 | `components/area/AreaApp.tsx` | inline | Welsh Index of Multiple Deprivation 2025 | keep |
| 6 | 1 | 0.5 | `components/area/AreaApp.tsx` | inline | sales in the 12 months to | keep |
| 6 | 1 | 4.0 | `components/area/AreaApp.tsx` | inline | Long-term risk is a different question — | keep |
| 6 | 1 | 0.5 | `components/auth/AccountApp.tsx` | inline | Sign in to see your deals | keep |
| 6 | 1 | 0.5 | `components/auth/AccountApp.tsx` | inline | and press Save — it'll appear here. | keep |
| 6 | 1 | 0.5 | `components/auth/LoginWall.tsx` | inline | Turn on cookies to sign in | keep |
| 6 | 1 | 6.4 | `components/auth/LoginWall.tsx` | inline | I accept the terms & disclaimer above | keep |
| 6 | 1 | 2.5 | `components/auth/LoginWall.tsx` | inline | Tick the terms box to continue. | keep |
| 6 | 1 | 4.5 | `components/deals/DealBoard.tsx` | inline | Sign in to see your pipeline | keep |
| 6 | 2 | 5.2 | `components/quiz/QuizApp.tsx` | inline | Got a property in mind? (optional) | keep |
| 6 | 1 | -1.4 | `components/quiz/QuizApp.tsx` | inline | Skip — take me to the tools | keep |
| 6 | 1 | 2.3 | `config/pipeline.ts` | todo | Decide if it’s worth a viewing | keep |
| 6 | 1 | 0.5 | `config/pipeline.ts` | todo | Book the viewing, or bin it | keep |
| 6 | 1 | 4.5 | `config/pipeline.ts` | todo | Chase the agent on your offer | keep |
| 6 | 1 | 4.5 | `config/pipeline.ts` | blurb | Exchange in sight — final checks landing. | keep |
| 6 | 1 | -2.2 | `config/stickyVerdict.ts` | announce | Deal score out of 10 — .  | keep |
| 6 | 1 | 4.5 | `core/strategies` | tip | The interest rate on the mortgage. | keep |
| 6 | 1 | 2.5 | `core/strategies` | tip | Weeks a year with no tenant. | keep |
| 6 | 1 | 2.3 | `core/strategies` | tip | Short-term money for the buy-and-refurb phase. | keep |
| 6 | 1 | 4.5 | `core/strategies` | tip | Refurbs run over — budget for it. | keep |
| 6 | 1 | 2.5 | `core/strategies` | name | Sale price vs nearby sold prices | keep |
| 6 | 1 | 2.3 | `core/strategies` | tip | Short-term money for the buy-and-refurb phase. | keep |
| 6 | 1 | 2.5 | `core/strategies` | tip | Weeks a year with no tenant. | keep |
| 6 | 1 | 0.5 | `core/strategies` | tip | The rate on the new mortgage. | keep |
| 6 | 1 | 6.4 | `core/strategies` | whyDefault | Lenders commonly stress-test at around 5.5%. | delete |
| 6 | 1 | 6.4 | `core/strategies` | whyDefault | Most investors already own a home. | delete |
| 6 | 1 | 2.5 | `core/strategies` | name | End value vs nearby sold prices | keep |
| 6 | 1 | 0.5 | `core/strategies` | tip | Your cash share of the price. | keep |
| 6 | 1 | 6.4 | `core/strategies` | whyDefault | Lenders commonly stress-test at around 5.5%. | delete |
| 6 | 1 | 6.4 | `core/strategies` | whyDefault | Most investors already own a home. | delete |
| 6 | 1 | 4.5 | `core/strategies` | name | Room income covers the mortgage (ICR) | keep |
| 6 | 1 | 4.5 | `core/strategies` | name | Rooms meet the legal minimum sizes | keep |
| 5 | 1 | -1.8 | `components/analyser/ActionBar.tsx` | inline | Saved ✓ — view in My deals | keep |
| 5 | 1 | -1.1 | `components/analyser/ActionBar.tsx` | inline | — it’ll re-score as facts land. | keep |
| 5 | 1 | 2.5 | `components/analyser/AnalyserApp.tsx` | inline | Couldn’t load the sales data | shorten / move to config |
| 5 | 1 | 0.5 | `components/analyser/Article4Flag.tsx` | inline | (opens in a new tab) | keep |
| 5 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | no end value achieves it | keep |
| 5 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | Return on money left in | keep |
| 5 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | Gross yield on total cost | keep |
| 5 | 1 | 7.6 | `components/analyser/BtlVerdict.tsx` | inline | Looks expensive vs sold evidence. | keep |
| 5 | 1 | 5.2 | `components/analyser/BtlVerdict.tsx` | inline | Below sold evidence — check why. | keep |
| 5 | 1 | 0.5 | `components/analyser/CompsModule.tsx` | inline | dimmed — excluded from the stats | keep |
| 5 | 1 | 0.5 | `components/analyser/FlipVerdict.tsx` | inline | Sale price needed for Green | keep |
| 5 | 1 | 0.5 | `components/analyser/FlipVerdict.tsx` | inline | Sale price needed for Green | keep |
| 5 | 1 | 2.9 | `components/analyser/FlipVerdict.tsx` | inline | no sale price achieves it | keep |
| 5 | 1 | 7.6 | `components/analyser/HmoVerdict.tsx` | inline | Looks expensive vs sold evidence. | keep |
| 5 | 1 | 5.2 | `components/analyser/HmoVerdict.tsx` | inline | Planning: do I need permission? | keep |
| 5 | 1 | 0.5 | `components/analyser/TransactionDetail.tsx` | inline | We couldn’t show this sale | shorten / move to config |
| 5 | 1 | 5.2 | `components/analyser/TransactionDetail.tsx` | inline | View sold history on Zoopla | keep |
| 5 | 1 | 0.5 | `components/area/AreaApp.tsx` | inline | (opens in a new tab) | keep |
| 5 | 1 | 15.5 | `components/area/AreaApp.tsx` | inline | Index of Multiple Deprivation 2025 | keep |
| 5 | 1 | 7.6 | `components/area/AreaApp.tsx` | inline | Typical price by property type | keep |
| 5 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | , this sector excluded). | keep |
| 5 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | sales that means setting aside | keep |
| 5 | 1 | 3.7 | `components/area/AreaApp.tsx` | inline | UK HPI over 5 years | keep |
| 5 | 1 | 2.5 | `components/area/AreaApp.tsx` | inline | Council tax band checker (GOV.UK) | keep |
| 5 | 1 | 2.9 | `components/area/AreaApp.tsx` | inline | Sold prices (HM Land Registry) | keep |
| 5 | 1 | 7.6 | `components/area/AreaApp.tsx` | inline | Analyse a property here as | keep |
| 5 | 1 | 2.9 | `components/auth/AccountApp.tsx` | inline | Couldn't delete "" — please try again. | keep |
| 5 | 1 | 2.9 | `components/auth/AccountApp.tsx` | inline | Your deals live in your | keep |
| 5 | 1 | 0.5 | `components/deals/DealBoard.tsx` | inline | Skipped a stage — your call. | keep |
| 5 | 1 | -2.2 | `components/deals/DealBoard.tsx` | inline | Deal score out of 10 | keep |
| 5 | 1 | 12.3 | `config/analyserSections.ts` | compsSummary |  comparable · typical · tap to explore | keep |
| 5 | 1 | -1.8 | `config/comparables.ts` | excluded | Left out of the stats | keep |
| 5 | 1 | 7.6 | `config/nav.ts` | hint | Choose a strategy to analyse | keep |
| 5 | 2 | -0.5 | `config/pipeline.ts` | blurb | Completed. The deal is done. | keep |
| 5 | 1 | 2.9 | `config/stickyVerdict.ts` | expand | Show the whole verdict line | keep |
| 5 | 1 | 2.9 | `config/stickyVerdict.ts` | collapse | Hide the whole verdict line | keep |
| 5 | 1 | 0.5 | `config/stickyVerdict.ts` | jump | Jump to the full verdict | keep |
| 5 | 1 | 2.9 | `core/strategies` | tip | What a letting agent charges. | shorten / move to config |
| 5 | 1 | 2.9 | `core/strategies` | name | Rent covers the mortgage (ICR) | keep |
| 5 | 1 | 0.5 | `core/strategies` | name | Price vs nearby sold prices | keep |
| 5 | 1 | 5.2 | `core/strategies` | tip | Everything the works will cost. | keep |
| 5 | 1 | 0.5 | `core/strategies` | tip | Charged on the bridging loan. | keep |
| 5 | 1 | 10.0 | `core/strategies` | tip | Conveyancing and survey on purchase. | keep |
| 5 | 1 | 5.2 | `core/strategies` | tip | Everything the works will cost. | keep |
| 5 | 1 | 0.5 | `core/strategies` | tip | Charged on the bridging loan. | keep |
| 5 | 1 | 10.0 | `core/strategies` | tip | Conveyancing and survey on purchase. | keep |
| 5 | 1 | 2.9 | `core/strategies` | tip | What a letting agent charges. | shorten / move to config |
| 5 | 1 | 7.6 | `core/strategies` | name | Money left in after refinance | keep |
| 5 | 1 | 2.9 | `core/strategies` | name | Rent covers the mortgage (ICR) | keep |
| 4 | 1 | 3.7 | `components/analyser/ActionBar.tsx` | inline | PDF export — coming soon. | keep |
| 4 | 1 | 9.6 | `components/analyser/AnalyserApp.tsx` | inline | Analyse this property as… | keep |
| 4 | 1 | 0.7 | `components/analyser/AnalyserApp.tsx` | inline | Watch the free walkthrough → | keep |
| 4 | 1 | 0.7 | `components/analyser/BrrrrVerdict.tsx` | inline | no price achieves it | keep |
| 4 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | Rent-covers-mortgage test (ICR %) | keep |
| 4 | 1 | 2.9 | `components/analyser/BtlVerdict.tsx` | inline | Rent-covers-mortgage test (ICR %) | keep |
| 4 | 1 | 3.7 | `components/analyser/BtlVerdict.tsx` | inline | Tax on rental profit | keep |
| 4 | 1 | 0.7 | `components/analyser/CompMap.tsx` | inline | Try the map again | keep |
| 4 | 1 | 3.7 | `components/analyser/CompsModule.tsx` | inline | Waiting for a postcode… | shorten / move to config |
| 4 | 1 | 0.5 | `components/analyser/DealScore.tsx` | inline | What’s holding it back: | keep |
| 4 | 1 | 6.6 | `components/analyser/FlipVerdict.tsx` | inline | Project return after tax ( | keep |
| 4 | 1 | 0.7 | `components/analyser/FlipVerdict.tsx` | inline | Tax on the profit | keep |
| 4 | 1 | 0.7 | `components/analyser/FlipVerdict.tsx` | inline | Max offer for Green | keep |
| 4 | 1 | 0.7 | `components/analyser/FlipVerdict.tsx` | inline | no price achieves it | keep |
| 4 | 1 | 3.7 | `components/analyser/GdvModule.tsx` | inline | Profit on sale price | keep |
| 4 | 1 | 2.9 | `components/analyser/HmoVerdict.tsx` | inline | Rent-covers-mortgage test (ICR %) | keep |
| 4 | 1 | -2.2 | `components/analyser/HmoVerdict.tsx` | inline | Tax on the rooms | keep |
| 4 | 1 | -2.2 | `components/analyser/Tooltip.tsx` | inline | What does this mean? | keep |
| 4 | 1 | 3.7 | `components/analyser/TransactionDetail.tsx` | inline | View at Land Registry | keep |
| 4 | 1 | 0.7 | `components/analyser/mapImpl.ts` | inline | Reset the map view | keep |
| 4 | 1 | 3.7 | `components/analyser/provenance.ts` | inline | brought from the extension | keep |
| 4 | 1 | 0.7 | `components/area/AreaApp.tsx` | inline | in the year to | shorten / move to config |
| 4 | 1 | 3.7 | `components/area/AreaApp.tsx` | inline | typical sold price from | keep |
| 4 | 1 | 12.5 | `components/area/AreaApp.tsx` | inline | the surrounding mile (typical | keep |
| 4 | 1 | 1.3 | `components/area/AreaApp.tsx` | inline | % of postcodes here | keep |
| 4 | 1 | 3.7 | `components/area/AreaApp.tsx` | inline | roughly half a mile | keep |
| 4 | 1 | 0.7 | `components/area/AreaApp.tsx` | inline | see live alerts (NRW) | keep |
| 4 | 1 | 0.5 | `components/area/AreaApp.tsx` | inline | Long-term flood risk checker ( | keep |
| 4 | 1 | 9.6 | `components/area/AreaApp.tsx` | inline | Analyse a property here | keep |
| 4 | 1 | 0.7 | `components/deals/DealBoard.tsx` | inline | Why are you parking ? | keep |
| 4 | 1 | 9.6 | `config/analyserSections.ts` | compsSummary |  comparable · tap to explore | keep |
| 4 | 1 | 3.7 | `config/analyserSections.ts` | maths | How is this calculated? | keep |
| 4 | 1 | 9.6 | `config/analyserSections.ts` | navLabel | Analyse this property as | keep |
| 4 | 1 | -2.2 | `config/nav.ts` | hint | More places to go | keep |
| 4 | 1 | -2.2 | `config/nav.ts` | label | Where should I start? | keep |
| 4 | 1 | 3.7 | `config/nav.ts` | label | Model a bridging deal | keep |
| 4 | 1 | 9.6 | `config/pipeline.ts` | todo | Push the solicitor along | keep |
| 4 | 1 | -2.2 | `config/pipeline.ts` | addToScore | Add to score this | keep |
| 4 | 1 | -2.2 | `config/pipeline.ts` | tapToScore | Tap to score this | keep |
| 4 | 1 | 3.7 | `config/pipeline.ts` | nothingToday | Nothing needs you today. | keep |
| 4 | 1 | -2.6 | `core/strategies` | unit | % of price/yr | keep |
| 4 | 1 | 3.7 | `core/strategies` | tip | Work needed before letting. | keep |
| 4 | 1 | 6.6 | `core/strategies` | name | Monthly cashflow after tax | keep |
| 4 | 1 | 3.7 | `core/strategies` | label | Sale price after works | keep |
| 4 | 1 | 9.6 | `core/strategies` | tip | Conveyancing on the sale. | keep |
| 4 | 1 | 3.7 | `core/strategies` | tip | Bridging is priced monthly. | keep |
| 4 | 1 | 6.6 | `core/strategies` | label | Your other income band | keep |
| 4 | 1 | 3.7 | `core/strategies` | label | End value after works | keep |
| 4 | 1 | 3.7 | `core/strategies` | tip | Bridging is priced monthly. | keep |
| 4 | 1 | 1.3 | `core/strategies` | unit | % of value/yr | keep |
| 4 | 1 | 6.6 | `core/strategies` | name | Monthly cashflow after tax | keep |
| 4 | 1 | 3.7 | `core/strategies` | label | Average rent per room | keep |
| 4 | 1 | 0.7 | `core/strategies` | label | Bills included in rent? | keep |
| 4 | 1 | 0.7 | `core/strategies` | label | No — tenants pay bills | keep |
| 4 | 1 | 9.6 | `core/strategies` | label | Operating costs (agent + bills) | keep |
| 4 | 1 | 24.3 | `core/strategies` | tip | Everything including agent management. | keep |
| 4 | 1 | 6.6 | `core/strategies` | name | Monthly cashflow after tax | keep |
| 3 | 1 | 1.3 | `components/analyser/ActionBar.tsx` | inline | Share on WhatsApp | keep |
| 3 | 1 | 9.2 | `components/analyser/ActionBar.tsx` | inline | In your pipeline ✓ | keep |
| 3 | 1 | 0.7 | `components/analyser/ActionBar.tsx` | inline | It’s in your | keep |
| 3 | 1 | 5.2 | `components/analyser/AnalyserApp.tsx` | inline | Analyse this as… | keep |
| 3 | 1 | 1.3 | `components/analyser/Article4Flag.tsx` | inline | Find the council | keep |
| 3 | 1 | 5.2 | `components/analyser/BrrrrVerdict.tsx` | inline | Your end value | keep |
| 3 | 1 | 5.2 | `components/analyser/BrrrrVerdict.tsx` | inline | vs our estimate | keep |
| 3 | 1 | 1.3 | `components/analyser/BrrrrVerdict.tsx` | inline | End value needed | keep |
| 3 | 1 | 5.2 | `components/analyser/BrrrrVerdict.tsx` | inline | Cashflow after tax | keep |
| 3 | 1 | 5.2 | `components/analyser/BtlVerdict.tsx` | inline | Land Transaction Tax | keep |
| 3 | 1 | 5.2 | `components/analyser/BtlVerdict.tsx` | inline | vs our estimate | keep |
| 3 | 1 | 5.2 | `components/analyser/BtlVerdict.tsx` | inline | Cashflow after tax | keep |
| 3 | 1 | -2.6 | `components/analyser/BtlVerdict.tsx` | inline | Cash in (incl. ) | keep |
| 3 | 1 | 5.2 | `components/analyser/BtlVerdict.tsx` | inline | Cashflow before tax | keep |
| 3 | 1 | 9.2 | `components/analyser/CompsModule.tsx` | inline | Minimum area (sqm) | keep |
| 3 | 1 | 9.2 | `components/analyser/CompsModule.tsx` | inline | Maximum area (sqm) | keep |
| 3 | 1 | 8.8 | `components/analyser/CompsModule.tsx` | inline | Minimum price (£) | keep |
| 3 | 1 | 8.8 | `components/analyser/CompsModule.tsx` | inline | Maximum price (£) | keep |
| 3 | 1 | 5.2 | `components/analyser/CompsModule.tsx` | inline | No matching sales | shorten / move to config |
| 3 | 1 | 13.1 | `components/analyser/CompsModule.tsx` | inline | sales included · typical | keep |
| 3 | 1 | 5.2 | `components/analyser/FlipVerdict.tsx` | inline | profit after tax | keep |
| 3 | 1 | 5.2 | `components/analyser/FlipVerdict.tsx` | inline | Your sale price | keep |
| 3 | 1 | 5.2 | `components/analyser/FlipVerdict.tsx` | inline | vs our estimate | keep |
| 3 | 1 | 5.2 | `components/analyser/FlipVerdict.tsx` | inline | Profit before tax | keep |
| 3 | 1 | 5.2 | `components/analyser/FlipVerdict.tsx` | inline | Profit after tax | keep |
| 3 | 1 | 1.3 | `components/analyser/FlipVerdict.tsx` | inline | Total cost in | keep |
| 3 | 1 | 2.9 | `components/analyser/HmoVerdict.tsx` | inline | Child under 10 | keep |
| 3 | 1 | 5.2 | `components/analyser/HmoVerdict.tsx` | inline | vs bricks-and-mortar estimate | keep |
| 3 | 1 | 9.2 | `components/analyser/HmoVerdict.tsx` | inline | Return on investment | keep |
| 3 | 1 | 5.2 | `components/analyser/HmoVerdict.tsx` | inline | Cashflow after tax | keep |
| 3 | 1 | 1.3 | `components/analyser/HmoVerdict.tsx` | inline | Gross room income | keep |
| 3 | 1 | 13.1 | `components/analyser/HmoVerdict.tsx` | inline | Net operating income | keep |
| 3 | 1 | 5.2 | `components/analyser/StrategySwitcher.tsx` | inline | Analyse this as… | keep |
| 3 | 1 | 1.3 | `components/analyser/SubjectForm.tsx` | inline | House number / name | keep |
| 3 | 1 | 9.2 | `components/analyser/SubjectForm.tsx` | inline | Internal area (sqm) | keep |
| 3 | 1 | 1.3 | `components/analyser/TransactionDetail.tsx` | inline | Search on Rightmove | keep |
| 3 | 1 | -2.6 | `components/analyser/ValuationCard.tsx` | inline | What it's worth | keep |
| 3 | 1 | 24.9 | `components/analyser/ValuationCard.tsx` | inline | Sale history unavailable | shorten / move to config |
| 3 | 1 | 5.2 | `components/analyser/mapImpl.ts` | inline | no tiles rendered | keep |
| 3 | 1 | 1.3 | `components/analyser/mapImpl.ts` | inline | webgl context lost | keep |
| 3 | 1 | 5.2 | `components/analyser/mapImpl.ts` | inline | Noto Sans Medium | keep |
| 3 | 1 | 1.3 | `components/analyser/provenance.ts` | inline | from the listing | keep |
| 3 | 1 | 1.3 | `components/analyser/provenance.ts` | inline | from EPC data | keep |
| 3 | 1 | -2.6 | `components/analyser/provenance.ts` | inline | you typed it | keep |
| 3 | 1 | 5.2 | `components/analyser/provenance.ts` | inline | your saved settings | keep |
| 3 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | See area data | keep |
| 3 | 1 | 9.2 | `components/area/AreaApp.tsx` | inline | Loading area data… | keep |
| 3 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | Area data loaded. | keep |
| 3 | 1 | 1.3 | `components/area/AreaApp.tsx` | inline | Sold data to | keep |
| 3 | 1 | 9.2 | `components/area/AreaApp.tsx` | inline | browse sold comparables | keep |
| 3 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | within a mile. | shorten / move to config |
| 3 | 1 | -2.6 | `components/area/AreaApp.tsx` | inline | Sold prices in | keep |
| 3 | 1 | 2.9 | `components/area/AreaApp.tsx` | inline | · 80% sold between | keep |
| 3 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | not enough sales | keep |
| 3 | 1 | -2.6 | `components/area/AreaApp.tsx` | inline | In line with | keep |
| 3 | 1 | 8.8 | `components/area/AreaApp.tsx` | inline | 5 years (total): | keep |
| 3 | 1 | -2.6 | `components/area/AreaApp.tsx` | inline | · UK HPI to | keep |
| 3 | 1 | -2.6 | `components/area/AreaApp.tsx` | inline | This is the | shorten / move to config |
| 3 | 1 | -3.0 | `components/area/AreaApp.tsx` | inline | % new build | keep |
| 3 | 1 | 8.8 | `components/area/AreaApp.tsx` | inline | Decile of 10 — | keep |
| 3 | 1 | 1.3 | `components/area/AreaApp.tsx` | inline | This sector is | keep |
| 3 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | Loading crime data… | keep |
| 3 | 1 | 9.2 | `components/area/AreaApp.tsx` | inline | incidents recorded in | keep |
| 3 | 1 | 1.3 | `components/area/AreaApp.tsx` | inline | of this postcode | keep |
| 3 | 1 | 5.2 | `components/area/AreaApp.tsx` | inline | Loading flood data… | keep |
| 3 | 1 | -2.6 | `components/area/AreaApp.tsx` | inline | Where these sold | keep |
| 3 | 1 | 9.2 | `components/auth/AccountApp.tsx` | inline | Marketing emails off. | keep |
| 3 | 1 | 9.2 | `components/auth/AccountApp.tsx` | inline | Open my pipeline | keep |
| 3 | 1 | 5.2 | `components/auth/AccountApp.tsx` | inline | Delete my account | keep |
| 3 | 1 | 5.2 | `components/auth/AccountApp.tsx` | inline | Delete my account | keep |
| 3 | 1 | -2.6 | `components/auth/AccountApp.tsx` | inline | Are you sure? | keep |
| 3 | 1 | 13.1 | `components/auth/AccountApp.tsx` | inline | This deletes everything. | keep |
| 3 | 1 | 13.1 | `components/auth/AccountApp.tsx` | inline | Yes — delete everything | keep |
| 3 | 1 | 1.3 | `components/auth/AccountApp.tsx` | inline | Keep my account | keep |
| 3 | 1 | -2.6 | `components/auth/LoginWall.tsx` | inline | Sign in to | keep |
| 3 | 1 | 5.2 | `components/auth/LoginWall.tsx` | inline | Terms and disclaimer | keep |
| 3 | 1 | 9.2 | `components/auth/LoginWall.tsx` | inline | Continue with Google | keep |
| 3 | 1 | -2.6 | `components/deals/DealBoard.tsx` | inline | No deals yet | keep |
| 3 | 1 | -2.6 | `components/deals/DealBoard.tsx` | inline | to a stage | keep |
| 3 | 1 | -2.6 | `components/site/Footer.astro` | inline | is made by | keep |
| 3 | 1 | 1.3 | `config/analyserSections.ts` | backToInputs | Back to inputs | keep |
| 3 | 1 | 17.0 | `config/analyserSections.ts` | assumptions | Assumptions — all editable | keep |
| 3 | 1 | 13.1 | `config/nav.ts` | label | Open the analyser | keep |
| 3 | 1 | -2.6 | `config/pipeline.ts` | label | Worth a look | keep |
| 3 | 1 | -2.6 | `config/pipeline.ts` | label | Going to view | keep |
| 3 | 1 | 5.2 | `config/pipeline.ts` | label | Getting real numbers | keep |
| 3 | 1 | 0.7 | `config/pipeline.ts` | label | Numbers don’t work | keep |
| 3 | 1 | -2.6 | `config/pipeline.ts` | label | Chain fell through | keep |
| 3 | 1 | 1.3 | `config/pipeline.ts` | label | Beaten to it | keep |
| 3 | 1 | -2.6 | `config/pipeline.ts` | label | Changed my mind | keep |
| 3 | 1 | -2.6 | `config/pipeline.ts` | roomRent | a room rent | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Through a company | keep |
| 3 | 1 | 13.1 | `core/strategies` | label | Agent management fee | keep |
| 3 | 1 | -3.0 | `core/strategies` | unit | % of rent | keep |
| 3 | 1 | 13.1 | `core/strategies` | tip | Yearly upkeep budget. | keep |
| 3 | 1 | 9.2 | `core/strategies` | tip | Buildings + landlord cover. | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Legal & survey costs | keep |
| 3 | 1 | 13.1 | `core/strategies` | tip | Conveyancing and survey. | keep |
| 3 | 1 | -2.6 | `core/strategies` | label | ICR stress rate | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Purchase tax basis | keep |
| 3 | 1 | -2.6 | `core/strategies` | name | Buy to let | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Funding the purchase | keep |
| 3 | 1 | 1.3 | `core/strategies` | label | Months to sale | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Estate agent fee | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Through a company | keep |
| 3 | 1 | 1.3 | `core/strategies` | label | Bridging loan size | keep |
| 3 | 1 | -3.0 | `core/strategies` | unit | % of price | keep |
| 3 | 1 | 13.1 | `core/strategies` | label | Bridging arrangement fee | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Bridging exit fee | keep |
| 3 | 1 | 9.2 | `core/strategies` | label | Purchase legals & survey | keep |
| 3 | 1 | 2.9 | `core/strategies` | unit | % of refurb | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Purchase tax basis | keep |
| 3 | 1 | 5.2 | `core/strategies` | name | Profit after tax | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Funding the purchase | keep |
| 3 | 1 | 9.2 | `core/strategies` | label | Months until refinance | keep |
| 3 | 1 | 1.3 | `core/strategies` | label | Rent after works | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Through a company | keep |
| 3 | 1 | 1.3 | `core/strategies` | label | Bridging loan size | keep |
| 3 | 1 | -3.0 | `core/strategies` | unit | % of price | keep |
| 3 | 1 | 13.1 | `core/strategies` | label | Bridging arrangement fee | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Bridging exit fee | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Legal & survey costs | keep |
| 3 | 1 | 13.1 | `core/strategies` | label | Agent management fee | keep |
| 3 | 1 | -3.0 | `core/strategies` | unit | % of rent | keep |
| 3 | 1 | 9.2 | `core/strategies` | tip | Buildings + landlord cover. | keep |
| 3 | 1 | 13.1 | `core/strategies` | label | Refinance interest rate | keep |
| 3 | 1 | -2.6 | `core/strategies` | label | ICR stress rate | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Purchase tax basis | keep |
| 3 | 1 | -3.0 | `core/strategies` | label | 7 or more | keep |
| 3 | 1 | 13.1 | `core/strategies` | label | Conversion / refurb budget | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Through a company | keep |
| 3 | 1 | 1.3 | `core/strategies` | label | HMO mortgage rate | keep |
| 3 | 1 | 9.6 | `core/strategies` | label | Operating costs (self-managed) | keep |
| 3 | 1 | 2.9 | `core/strategies` | unit | % of income | keep |
| 3 | 1 | 2.9 | `core/strategies` | unit | % of income | keep |
| 3 | 1 | 1.3 | `core/strategies` | label | HMO licence fee | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Legal & survey costs | keep |
| 3 | 1 | 13.1 | `core/strategies` | tip | Conveyancing and survey. | keep |
| 3 | 1 | -2.6 | `core/strategies` | label | ICR stress rate | keep |
| 3 | 1 | 5.2 | `core/strategies` | label | Purchase tax basis | keep |
| 2 | 1 | 8.8 | `components/analyser/Accordion.tsx` | inline | Your numbers | keep |
| 2 | 1 | 2.9 | `components/analyser/ActionBar.tsx` | inline | Copy link | keep |
| 2 | 1 | -3.0 | `components/analyser/ActionBar.tsx` | inline | Saved to | keep |
| 2 | 1 | -3.0 | `components/analyser/ActionBar.tsx` | inline | My deals | keep |
| 2 | 1 | 8.8 | `components/analyser/AnalyserApp.tsx` | inline | The property | keep |
| 2 | 1 | 14.7 | `components/analyser/AnalyserApp.tsx` | inline | Strategy verdict | keep |
| 2 | 1 | -3.0 | `components/analyser/AnalyserApp.tsx` | inline | New to | keep |
| 2 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | The outcome | keep |
| 2 | 1 | 8.8 | `components/analyser/BrrrrVerdict.tsx` | inline | Not reachable | keep |
| 2 | 1 | 8.8 | `components/analyser/BrrrrVerdict.tsx` | inline | Not reachable | keep |
| 2 | 1 | 8.8 | `components/analyser/BrrrrVerdict.tsx` | inline | Refinance loan | keep |
| 2 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | Cash invested | keep |
| 2 | 1 | 2.9 | `components/analyser/BrrrrVerdict.tsx` | inline | Bridging cost | keep |
| 2 | 1 | 32.4 | `components/analyser/BrrrrVerdict.tsx` | inline | Effectively infinite | keep |
| 2 | 1 | 2.9 | `components/analyser/BtlVerdict.tsx` | inline | Gross yield | keep |
| 2 | 1 | 2.9 | `components/analyser/BtlVerdict.tsx` | inline | Net yield | keep |
| 2 | 1 | 20.6 | `components/analyser/CompsModule.tsx` | inline | Comparable filters | keep |
| 2 | 1 | 2.9 | `components/analyser/CompsModule.tsx` | inline | Det + semi | keep |
| 2 | 1 | -3.0 | `components/analyser/CompsModule.tsx` | inline | New build | keep |
| 2 | 1 | 2.9 | `components/analyser/CompsModule.tsx` | inline | Area sqm | keep |
| 2 | 1 | -3.4 | `components/analyser/CompsModule.tsx` | inline | Price £ | keep |
| 2 | 1 | 8.8 | `components/analyser/CompsModule.tsx` | inline | Thin evidence: | keep |
| 2 | 1 | -3.0 | `components/analyser/CompsModule.tsx` | inline | · as of | keep |
| 2 | 1 | 14.7 | `components/analyser/CompsModule.tsx` | inline | Comparables view | keep |
| 2 | 1 | 2.9 | `components/analyser/CompsModule.tsx` | inline | Sold nearby | keep |
| 2 | 1 | 2.9 | `components/analyser/FlipVerdict.tsx` | inline | before tax: | keep |
| 2 | 1 | 2.9 | `components/analyser/FlipVerdict.tsx` | inline | Cash invested | keep |
| 2 | 1 | 2.9 | `components/analyser/FlipVerdict.tsx` | inline | Finance costs | keep |
| 2 | 1 | 8.8 | `components/analyser/FlipVerdict.tsx` | inline | Not reachable | keep |
| 2 | 1 | 8.8 | `components/analyser/FlipVerdict.tsx` | inline | Not reachable | keep |
| 2 | 1 | 2.9 | `components/analyser/HmoVerdict.tsx` | inline | One adult | keep |
| 2 | 1 | 2.9 | `components/analyser/HmoVerdict.tsx` | inline | Two adults | keep |
| 2 | 1 | 14.7 | `components/analyser/HmoVerdict.tsx` | inline | Operating costs | keep |
| 2 | 1 | 2.9 | `components/analyser/HmoVerdict.tsx` | inline | Gross yield | keep |
| 2 | 1 | 2.9 | `components/analyser/HmoVerdict.tsx` | inline | Net yield | keep |
| 2 | 1 | -3.0 | `components/analyser/HmoVerdict.tsx` | inline | Cash in | keep |
| 2 | 1 | -3.4 | `components/analyser/SubjectForm.tsx` | inline | Price (£) | keep |
| 2 | 1 | 8.8 | `components/analyser/SubjectForm.tsx` | inline | Property type | keep |
| 2 | 1 | 2.9 | `components/analyser/SubjectForm.tsx` | inline | EPC lookup | keep |
| 2 | 1 | 2.9 | `components/analyser/SubjectForm.tsx` | inline | Refurb needed | keep |
| 2 | 1 | -3.0 | `components/analyser/SubjectForm.tsx` | inline | Age band | keep |
| 2 | 1 | -3.0 | `components/analyser/TransactionDetail.tsx` | inline | new build | keep |
| 2 | 1 | 5.2 | `components/analyser/TransactionDetail.tsx` | inline | · non-standard sale | keep |
| 2 | 1 | 14.7 | `components/analyser/ValuationCard.tsx` | inline | Likely between | keep |
| 2 | 1 | 2.9 | `components/area/AreaApp.tsx` | inline | Thin market: | keep |
| 2 | 1 | 2.9 | `components/area/AreaApp.tsx` | inline | sales in | keep |
| 2 | 1 | -3.0 | `components/area/AreaApp.tsx` | inline | Price trend — | keep |
| 2 | 1 | 20.6 | `components/area/AreaApp.tsx` | inline | Market activity | keep |
| 2 | 1 | 8.4 | `components/area/AreaApp.tsx` | inline | % freehold / | keep |
| 2 | 1 | -3.0 | `components/area/AreaApp.tsx` | inline | · based on | keep |
| 2 | 1 | 2.9 | `components/area/AreaApp.tsx` | inline | current flood | keep |
| 2 | 1 | 8.8 | `components/area/AreaApp.tsx` | inline | Official checks | keep |
| 2 | 1 | 14.7 | `components/area/AreaApp.tsx` | inline | Sold comparables | keep |
| 2 | 1 | -3.0 | `components/area/AreaApp.tsx` | inline | Hide map | keep |
| 2 | 1 | -3.0 | `components/area/AreaApp.tsx` | inline | Show map | keep |
| 2 | 1 | -3.0 | `components/auth/AccountApp.tsx` | inline | Log in | keep |
| 2 | 1 | 8.8 | `components/auth/AccountApp.tsx` | inline | Your account | keep |
| 2 | 1 | -3.0 | `components/auth/AccountApp.tsx` | inline | Log out | keep |
| 2 | 1 | -3.0 | `components/auth/AccountApp.tsx` | inline | My deals | keep |
| 2 | 1 | -3.0 | `components/auth/AccountApp.tsx` | inline | My deals | keep |
| 2 | 1 | -3.0 | `components/auth/AuthHeader.tsx` | inline | Log in | keep |
| 2 | 1 | -3.0 | `components/auth/AuthHeader.tsx` | inline | My deals | keep |
| 2 | 1 | 2.9 | `components/auth/LoginWall.tsx` | inline | Copy link | keep |
| 2 | 1 | -3.0 | `components/deals/DealBoard.tsx` | inline | Log in | keep |
| 2 | 1 | -3.0 | `components/deals/DealBoard.tsx` | inline | Keep it | keep |
| 2 | 1 | -3.0 | `components/quiz/QuizApp.tsx` | inline | Step of | keep |
| 2 | 1 | 8.4 | `components/quiz/QuizApp.tsx` | inline | Budget (£) | keep |
| 2 | 1 | 2.9 | `components/quiz/QuizApp.tsx` | inline | Open the | keep |
| 2 | 1 | 8.8 | `components/site/Header.astro` | inline | Area Data | keep |
| 2 | 1 | 14.7 | `config/analyserSections.ts` | currentHint | current strategy | keep |
| 2 | 1 | 2.9 | `config/comparables.ts` | withCount | Filters · set | keep |
| 2 | 1 | 8.8 | `config/comparables.ts` | clear | Reset filters | keep |
| 2 | 1 | 14.7 | `config/comparables.ts` | listLabel | Sold comparables | keep |
| 2 | 1 | 8.8 | `config/comparables.ts` | distanceValue |  miles away | keep |
| 2 | 1 | 8.8 | `config/nav.ts` | label | Area Data | keep |
| 2 | 1 | 2.9 | `config/pipeline.ts` | label | Offer in | keep |
| 2 | 1 | 8.8 | `config/pipeline.ts` | label | Offer accepted | keep |
| 2 | 1 | 2.9 | `config/pipeline.ts` | label | Nearly there | keep |
| 2 | 1 | 2.9 | `config/pipeline.ts` | todo | Chase exchange | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | label | Bought it | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | label | Parked / dead | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | label | Too dear | keep |
| 2 | 1 | 8.8 | `config/pipeline.ts` | label | Survey finding | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | label | Short lease | keep |
| 2 | 1 | 2.9 | `config/pipeline.ts` | label | Service charge | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | label | Ground rent | keep |
| 2 | 1 | 2.9 | `config/pipeline.ts` | label | Auction fees | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | satHere | sat here | keep |
| 2 | 1 | 2.9 | `config/pipeline.ts` | noUpdate | no update | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | goneCold | gone cold | keep |
| 2 | 1 | -3.0 | `config/pipeline.ts` | live |  of live | keep |
| 2 | 1 | 2.9 | `config/stickyVerdict.ts` | region | Deal verdict | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Monthly rent | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Mortgage rate | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Buying as | keep |
| 2 | 1 | 13.1 | `core/strategies` | label | Personally — basic-rate | keep |
| 2 | 1 | 13.1 | `core/strategies` | label | Personally — higher-rate | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Letting agent | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Void allowance | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Landlord insurance | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Refurb budget | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Mortgage type | keep |
| 2 | 1 | 26.5 | `core/strategies` | label | Additional property | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Only property | keep |
| 2 | 1 | 1.3 | `core/strategies` | label | First-time buyer | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Refurb budget | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Bridging loan | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Selling legals | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Buying as | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Bridging rate | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Basic rate | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Higher rate | keep |
| 2 | 1 | 26.5 | `core/strategies` | label | Additional property | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Only property | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Refurb budget | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Bridging loan | keep |
| 2 | 1 | 6.6 | `core/strategies` | label | Refinance loan-to-value | keep |
| 2 | 1 | 8.4 | `core/strategies` | label | Custom % | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Custom LTV | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Buying as | keep |
| 2 | 1 | 13.1 | `core/strategies` | label | Personally — basic-rate | keep |
| 2 | 1 | 13.1 | `core/strategies` | label | Personally — higher-rate | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Bridging rate | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Refinance legals | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Void allowance | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Landlord insurance | keep |
| 2 | 1 | 26.5 | `core/strategies` | label | Additional property | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Only property | keep |
| 2 | 1 | 1.3 | `core/strategies` | label | First-time buyer | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Lettable rooms | keep |
| 2 | 1 | 5.2 | `core/strategies` | label | Yes — all-inclusive | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Buying as | keep |
| 2 | 1 | 13.1 | `core/strategies` | label | Personally — basic-rate | keep |
| 2 | 1 | 13.1 | `core/strategies` | label | Personally — higher-rate | keep |
| 2 | 1 | 8.8 | `core/strategies` | label | Letting agent | keep |
| 2 | 1 | 2.9 | `core/strategies` | label | Compliance costs | keep |
| 2 | 1 | 26.5 | `core/strategies` | label | Additional property | keep |
| 2 | 1 | 14.7 | `core/strategies` | label | Only property | keep |
| 1 | 1 | 8.4 | `components/analyser/ActionBar.tsx` | inline | Copied ✓ | keep |
| 1 | 1 | 8.4 | `components/auth/LoginWall.tsx` | inline | Copied ✓ | keep |
| 1 | 1 | 8.4 | `config/comparables.ts` | include | Include  | keep |
