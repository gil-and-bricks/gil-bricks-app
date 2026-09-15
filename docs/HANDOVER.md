# PropLaunch — the handover

**Written 15 September 2026.** For the operator, not for a developer. If you are
an assistant picking this up cold, read sections 1, 7 and 9 first — 7 is the one
that will save you.

Everything here was checked against the code on the day it was written. Where
something could not be verified it says so rather than guessing.

---

## 1. What this is

PropLaunch is a free property deal analyser for **England and Wales**. Somebody
finds a house for sale, puts the numbers in, and the site tells them what the
deal actually does: what cash they need, what it returns, and what the sold
evidence nearby says the place is really worth.

It is built for two people: someone buying for themselves, and a deal sourcer
who packages deals for investors. Both are usually working from a phone, in a
hurry, on a listing they found ten minutes ago.

What makes it different is what it refuses to do. It uses **only official open
data** — HM Land Registry sold prices, ONS, the EPC register, ONSPD postcodes.
It never scrapes a portal, never shows a live asking price, never names a
lender. Every projected figure is labelled as an estimate and says what it is
based on. When it does not know something it says so instead of filling the gap.

Things that are easy to forget, and all of them are deliberate:

- **England and Wales only.** Scotland and Northern Ireland are refused
  politely, by postcode country code. Different legal systems, different data.
- **Free forever. There are no payments anywhere in the product.**
- **The app never sends email.** Not one line of it. Marketing emails go out
  through Kit, triggered by a row the app writes to a queue. If Kit is down the
  row waits; nothing is lost and nothing is sent by us.
- **No cookie banner**, because there is nothing to consent to — strictly
  necessary cookies only.
- **£0 running cost**, on Cloudflare's free tier. This is a hard constraint, not
  an aspiration. If a feature needs paid infrastructure, the feature does not
  get built.
- **No phone numbers are collected anywhere** except the bridging enquiry form,
  which needs one because the outcome is a phone call. That exception is written
  down in three places on purpose.

---

## 2. What is built

**The four analysers** — buy-to-let, BRRRR, flip and HMO. One engine, four
configurations; they are not four separate products. Put in a postcode, a price
and a few facts and you get the cash needed (including stamp duty), the return,
and a verdict. *Deliberately does not:* let you save a deal without signing in,
or analyse anything outside England and Wales. *Would surprise you:* the four
share one codebase so completely that adding a fifth strategy is a config file,
not a feature.

**The Deal Score** — a score out of ten with a one-line verdict naming the
number that is binding. It is not a recommendation and never says "buy". The
levers underneath tell you what would have to change for the answer to change.
*Would surprise you:* the score is computed in the browser, never on the server.
The server stores facts; the browser scores them. That is why the extension, the
analyser and the deal card can all agree — they run the same code.

**The criteria system** — you set what you are looking for; deals are measured
against it. *Deliberately does not:* filter anything out. It tells you how a
deal sits against your rules and leaves the decision to you.

**Area data** — sold prices, typical values, activity and deprivation by
postcode sector, plus a ten-year price trajectory panel. From Land Registry and
ONS. *Deliberately does not:* predict. The trajectory is what happened, not what
will happen.

**Comparables** — the standard sales near a postcode, with £/m² where the floor
area is known, on a map. *Deliberately does not:* include bedrooms as a filter,
or use time-on-market or auction results — those are portal data and are
permanently excluded. *Would surprise you:* prices are shown in £/m², never per
square foot, because the EPC register returns metres and the product asks for
metres. Square feet anywhere in the UI is our own inconsistency, not a feature.

**The pipeline** — deals you save land on a board and **re-score themselves as
facts arrive**. That is the spine of it. *Deliberately does not:* let you add a
property by hand. A deal can only be born from an analyser payload — that is
enforced by construction and a test fails loudly if anyone adds a second way in.
It ends at purchase: nothing about owning, letting, tenancies or tax.

**The three tools** — equity, rental yield, stamp duty. Standalone calculators
that need no account.

**The refurb section** — a costed scope with **regional figures** (a base cost
per item, adjusted by region and labour factor, last reviewed 1 September 2026),
a duration estimate that is a runway rather than time-on-tools, and a photo
carousel carrying **40 pointers** — things to look for in a room, 18 of them
citing a regulation. *Deliberately does not:* quote you. It is an estimate with
its basis shown.

**The floor plan tool** — trace a plan, get room areas and a total. Yours, drawn
by you; the agent's floor plan is never fetched or stored.

**Bridging finance** — an **introduction to one broker the operator knows**.
Treat this page like a legal document. It does not advise, compare, recommend,
or name a lender, and it may never say it will find the best rate. Qualification
is server-side, two buckets only. The enquiry form takes a phone number, which
is the one sanctioned exception to the no-phone rule. **It does not render at
all until the broker config is filled in** — see section 4.

**The credit page** — explains why a credit file matters, with an affiliate link
to CheckMyFile disclosed in the first words, not the small print. Until the
affiliate URL is set, the page still teaches the insight and simply has no link.

**The deal pack** — a sourcer builds an investor-facing document from a saved
deal: cover, returns, costs, the plan, the area, comparables, final figures,
photographs, and three locked sections that can never be removed (where every
figure came from, the sourcer's registrations, the disclaimer). Saving attaches
it to the deal and produces a **share link** that WhatsApp or email can carry.
*Would surprise you:* the pack carries no Deal Score and no verdict, ever — a
document sent to an investor must not carry our opinion.

**The Chrome extension** — a side panel that reads the listing page you are
already looking at and hands the numbers to the analyser. *Deliberately does
not:* fetch anything from a portal. It reads the page you personally opened, in
your own browser. That is the line, and it is why the extension is allowed at
all under the no-scraping rule.

---

## 3. What is not built, and why

These are decided, not pending. In three months you will be tempted by some of
them; the reasons are here so you do not have to re-derive them.

| Not built | What the exclusion protects |
|---|---|
| Portal datasets — time-on-market, auction results | The no-scraping rule, and the legal position underneath it |
| Live asking prices or rents | Same. Sold data is fact; asking prices are marketing |
| Named lenders | The bridging page is an introduction, not advice |
| LHA rates | They are free open data, but the annual update burden is real — this is a simplicity exclusion, not a data one |
| Section 21 / Renters' Rights content | Changes faster than we can maintain it honestly |
| EPC C / MEES warnings | Would be advice about future regulation |
| Commercial HMO valuation | A different profession |
| Portfolio tracker | The pipeline ends at purchase, on purpose |
| Phone capture anywhere but bridging | One sanctioned exception, documented three times |
| Cookie banner | Nothing to consent to |
| Email from the app | Kit does it, or nobody does |
| Bedrooms as a comparables filter | Noise, not signal |
| `llms.txt` | Google has said plainly it does nothing for their AI features and no major assistant has confirmed honouring it. Building one and calling it a win would be a superstition |

---

## 4. What is waiting on whom

### Yours, in the order to do them

1. **Add the Google Search Console DNS record.** Search Console → Add property →
   **Domain** → `proplaunch.ai`. It shows a TXT value starting
   `google-site-verification=`. In Cloudflare: `proplaunch.ai` zone → DNS →
   Records → Add record → Type `TXT`, Name `@`, Content the whole string, TTL
   Auto. Then click Verify.
   **What goes live when you do:** nothing user-facing. It unlocks indexation
   data, the sitemap submission, and the monitoring job, which has nothing to
   read until the property exists.

2. **Import to Bing Webmaster Tools** from Search Console once Google verifies.
   **What goes live:** nothing user-facing. Bing is the index ChatGPT browses.

3. **Turn off Cloudflare's managed robots.txt.** The zone is currently
   prepending its own block to ours, so the served file has two `User-agent: *`
   groups. Look for AI Crawl Control (it may sit under Security) — the setting
   that adds Cloudflare's block to robots.txt. The marker in the served file is
   `# BEGIN Cloudflare Managed content`.
   **What goes live:** nothing visible. Our file already names and allows
   Googlebot, Bingbot, OAI-SearchBot, PerplexityBot and Claude-SearchBot, and
   blocks the training crawlers — under test, in the repository.

4. **Fill in the broker block** (`src/config/bridging.ts`). ⚠️ **This is the one
   to be careful with.** The moment `BROKER.name`, `email`, `inbox` and the Kit
   tags are real, **the bridging enquiry form appears on the public site**. It
   is gated precisely so it cannot collect anything while there is nowhere for
   it to go. Do not fill this in until the Kit automations exist.

5. **Create the Kit automations** for each tag, then paste the tag IDs. The
   fact-find step does not render until `kitTagFactFind` is real — the gate is
   what keeps the consent statement true.

6. **Paste the CheckMyFile affiliate URL** (`src/config/credit.ts`,
   `affiliateUrl`). **What goes live:** the link appears on the credit page with
   its disclosure. Until then the page teaches the insight and has no link.

7. **Drop in four YouTube playlist URLs** (`packages/core/src/config.ts`,
   `youtube`). All four currently point at the channel. **What goes live:** the
   per-strategy walkthrough link beside each verdict changes target. Low risk.

### Mine, outstanding

- The Search Console monitoring job. Cannot be built usefully until the property
  exists and credentials are issued — it would have nothing to read and no way
  to be tested.
- Submitting the sitemap to both engines. Blocked on the same.
- The eleven worker test files that hand-maintain their own migration lists (see
  section 7 — this has already bitten once).

---

## 5. Every config value you might fill in

| File | Value | Controls | When set | While empty |
|---|---|---|---|---|
| `config/bridging.ts` | `BROKER.name` | Who the introduction names | **The bridging form goes live** | Page renders, form does not |
| `config/bridging.ts` | `BROKER.email` / `inbox` | Where Kit sends the enquiry | Enquiries can reach him | Form gated off |
| `config/bridging.ts` | `kitTagQualified` / `kitTagNotYet` | Which Kit automation fires | Enquiries route correctly | Outbox row stays pending, cron retries, nothing lost |
| `config/bridging.ts` | `kitTagFactFind` | The broker's fact-find link | **Fact-find step renders** | Step does not render at all |
| `config/bridging.ts` | `kitTagEnquiry` | His link to enquiry answers | He can read them | Gated, because the consent tick must stay true |
| `config/credit.ts` | `affiliateUrl` | The CheckMyFile link | Link appears, disclosed first | Page teaches, no link |
| `config/capture.ts` | `kitTag` ×3 | Tool email capture | The tick box appears | No capture offered |
| `core/config.ts` | `youtube.{btl,flip,brrrr,hmo}` | Per-strategy walkthrough | Links point at playlists | All four point at the channel |
| `config/refurbFigures.ts` | `REFURB_FIGURES`, `REGION_MULTIPLIERS`, `LABOUR_FACTORS` | Refurb cost estimates | New figures apply everywhere | Current figures, reviewed 2026-09-01 |
| `config/features.ts` | 41 flags | Every feature | Feature appears | Feature absent, and the build still passes — there is a CI job that proves it |
| `site.config.ts` | name, domain, socials, tagline | Brand identity everywhere | Changes site-wide | Current values |
| `config/crawlers.ts` | Crawler policy | robots.txt | Policy changes | — (under test; five crawlers cannot be disallowed by accident) |

---

## 6. How to check it still works

Run from `packages/web` unless noted. **Several need a build first**
(`npm run build`) because they read the built output.

| Gate | Command | What it proves | What it does **not** prove |
|---|---|---|---|
| Unit tests | `npx vitest run` | The maths, the ratchets, the copy rules, the guards | Nothing about how a page looks or behaves |
| Copy | `npm run copy-gate` | No visible block over 30 words | Not that the words are *good* |
| Render | `npm run render-gate` | Nothing throws, no empty box, no stuck placeholder, both widths | **No value is checked.** A page of wrong numbers passes |
| Console | `npm run console-gate` | 28 pages × 2 widths, not one console error | Run locally there is no Worker, so `/api` is never exercised |
| Input | `npm run input-gate` | Every input moves the page, or has a written reason | Not that it moves it *correctly* |
| Journey | `npm run journey-gate` | Arrival, photos, plan, lookup, edit, strategy change, refusals | Signed-in behaviour |
| Signed-in | `npm run signed-in-gate` | Sign in, save, reopen, add a fact, re-score, park, restore | Runs against a **local** Worker, not the deployed site |
| Map | `npm run map-gate` | The basemap really renders, pins, popups, contrast, range requests | Not that the pins are in the right places |
| Pack | `npm run pack-gate` | A real pack in a real browser: A4 sheets, no page over its footer, share, offline file | Not that the document is well designed |
| SEO | `npm run seo-gate` | Structured data reaches the page, refresh date is crawlable, noindex pages carry none, robots.txt policy | Not that Google likes it |
| Flags off | `npm run test:flags-off` | The whole suite passes with every feature flag off | — |

CI runs the first five plus the build; the browser-heavy ones run in the
`journey` workflow every six hours and can be triggered by hand.

---

## 7. The traps this project has hit more than once

**This is the most valuable section. Read it before changing anything.**

### Tests that verify intent rather than behaviour

*What it looked like:* a test greps our own stylesheet for a CSS declaration and
passes. The browser ignores the declaration entirely, because a third-party
sheet loads after ours and wins on equal specificity. The test was checking that
we had *written* something, not that it *did* anything.

*What it cost:* the map's styling sat broken from one sprint to another, through
green CI the whole time.

*What catches it now:* assert the **computed value or the pixels**, in a real
browser. If a check can pass while the user-visible result is wrong, it is not a
check.

### A round-trip through a shared list that passes while the thing is missing from both sides

*What it looked like:* the robots.txt test looped over the crawler config to
decide what to check. Move Bingbot out of the allowed list into the blocked one —
the realistic mistake — and the test simply **stops checking Bingbot** and
passes. Two of the five crawlers behaved that way. It only caught the other
three because they happened to appear in a hardcoded assertion elsewhere.

*What it cost:* nothing, because proving it bites caught it the same hour. It
would have cost the site's visibility in Bing, and therefore in ChatGPT.

*What catches it now:* **write the contract out in the test.** A test must not
read its expectations from the thing it is testing. And prove it fails, one case
at a time, before believing it.

### A skipped assertion that is a lie

*What it looked like:* `if (asOf === undefined) continue;` in a test meant to
check the data refresh date reached the page. The date was undefined on both
pages, the test passed, and the freshness signal the sprint existed to add was
not there at all.

*What catches it now:* assert the precondition **loudly**, with the command that
fixes it. `if (x === null) return;` is the shape to hunt for.

### Tests that read a built artefact, run before the build

*What it looked like:* a test reads `dist/index.html`. It passes on a machine
that has built and fails in CI, which builds after testing. Hit twice in two
days: once typechecking after a build so generated types were present, once
reading `dist/` directly.

*What catches it now:* anything reading `dist/`, `.output/` or generated types
belongs in a **gate that runs after the build**, not in the unit suite. The rule
is in CLAUDE.md; it is easy to agree with and easy to forget.

### Gates starved by whatever runs before them

*What it looked like:* a gate's selector (`.board-live`) did not exist, so the
check silently fell back to `main` and passed by coincidence — the section it
was meant to inspect happened to be collapsed.

*What catches it now:* grep for the class before you assert on it. A selector in
a gate must exist.

### Cleanups confirmed by the same pattern that had just failed

*What it looked like:* confirming processes were stopped by pattern-matching,
using the same pattern that had already missed them. Fourteen processes ran for
six hours.

*What catches it now:* enumerate individually. Never confirm a cleanup with the
mechanism that performed it.

### Measuring the wrong half of a two-variable change

*What it looked like:* two things changed together; one was reverted, the symptom
persisted, and that was reported as proof the other was innocent. It proved
nothing at all. The real cause was the untested variable.

*What it cost:* a confident, public, wrong conclusion.

*What catches it now:* when two things change together, **isolate one at a
time** and say plainly which variable the evidence actually covers.

### Testing a path you constructed yourself rather than the one a user takes

*What it looked like:* a check that measures the page width and calls it fitted,
while the page sits half off-screen because it was centred before being scaled.
Width was right; **position** was never measured.

*What catches it now:* measure what the user would actually notice — position,
not just size; the rendered face, not the element with no text in it.

### And one for measurement itself

Three separate "regressions" this month were the measuring instrument, not the
code: a `curl -I` that sends HEAD and reports every cached file as uncached; a
shell variable holding `-r 0-1023` that zsh passed as one argument and the
server rejected as malformed; and a page that fetches a live image, captured
once before it landed and once after.

**Before reporting a regression, check whether the thing disagrees with
itself.** Run the measurement twice on unchanged code. It costs a minute and has
saved three wrong reports.

---

## 8. The architecture in plain English

**Cloudflare Workers** serve the site. The pages are built ahead of time into
flat files; the Worker sits in front and handles anything that needs a server —
signing in, the API, redirects from the old address.

**D1** is the database. Accounts, saved deals, their facts and history, the
email queue, and the heartbeat each scheduled job stamps when it finishes. It is
created in the EU. There is no UK-only option and we never claim one.

**R2** is file storage. Two things live there: one JSON file per postcode sector
(the data every lookup reads) and the map's tile archive. Saved deal packs also
go here, because they contain photographs and a database is the wrong home for
those.

**The Chrome extension** is a separate build. It reads the listing page you have
open and hands the numbers over. It talks to the same API as the site.

**The data pipeline** runs monthly on GitHub Actions, in a public repository. It
downloads the open data, builds the sector files, uploads them to R2 and writes
a manifest. The manifest is the single source of truth for "as of when".

**Two scheduled jobs.** One every fifteen minutes, one daily at 06:00 UTC. Each
stamps a heartbeat **only when its work completed**, so a job that throws shows
up as a job that stopped.

**The outbox** is how the app avoids sending email. When something needs to
reach Kit, a row is written to the database first. The scheduled job picks it up
and calls Kit. If Kit is down the row waits and is retried. Nothing is lost, and
the app itself never sends anything.

---

## 9. If something breaks

**First, in order:**

1. `https://proplaunch.ai/api/health` — the app's own account of itself.
   Anonymous callers get one word; the detail needs the health token.
2. The GitHub issues list. A failing health check **opens an issue assigned to
   you**, because the app may never email you.
3. The `journey` workflow's last run — it exercises the browser paths.

**What health covers:** the database is reachable, both scheduled jobs have
stamped recently, the data is reachable, its schema is the expected version, it
is not stale, and the email queue is neither backed up nor failing.

**What it does not cover:** anything visual. It cannot tell you a page looks
wrong, a number is wrong, or a button does nothing.

**Stale browser or broken site?** This has cost two days, twice. Open the site
in a private window. If it works there, it is a cached browser and not a broken
site. The pages are served with revalidation, but a service worker or a pinned
tab can hold an old bundle. Check the deployed version in Cloudflare against the
last commit before assuming anything is wrong with the code.

**If the monthly data refresh fails:** the site keeps serving the previous
month's data and the footer says how old it is. Health flags it stale after the
configured number of days. Re-run the pipeline workflow; nothing needs to be
taken down.

**If sign-in breaks:** check Turnstile's hostname list includes the current
domain — that has broken once already after a domain move. Then check the Google
client ID and that the JWT secret is still set.

**If the extension stops handing anything over:** the listing page's markup has
almost certainly changed. The extension reads what is on screen; it does not
fetch anything. Check the side panel for what it *did* read before assuming the
handoff is broken.

---

## 10. The history worth knowing

The product began as a deal analyser and grew a pipeline when it became obvious
that the interesting part is not the first answer but **how the answer changes
as facts arrive**. That is why deals re-score themselves and why nothing can be
added to the pipeline by hand.

**The turning points:**

- **The copy was cut roughly in half** in a dedicated pass. Wordiness was
  treated as a navigation problem rather than a style one: the more there is to
  read, the harder the page is to use. The rules that came out of it — under 30
  words, labels not sentences, a field earns a description only if it prevents a
  wrong entry — are enforced by a test.
- **Parquet was abandoned** after being planned. Per-sector JSON turned out to
  be the right shape for a product that looks up one sector at a time. It was
  never built; nothing needs it.
- **The domain moved** to proplaunch.ai. That broke three things quietly: the
  local dev sign-in door, the map's sprite loading, and — the expensive one —
  byte-serving of the map's 1.07GB tile archive once a cache rule was applied to
  the bucket. The archive was moved to a different host as a mitigation and then
  moved back once the rule excluded it, because one host with no rate-limited
  development endpoint was worth more than the mitigation.
- **The deal pack was built, rejected, rebuilt, and then partly reverted.** The
  first version was described as the worst-designed thing on the site. The
  second was well designed but sat on a bare layout that lost the entire design
  system, so it looked like a different product. The third fixed that. The
  fourth fixed five genuinely broken toggles by moving every control onto the
  pages — and in doing so rebuilt the layout that had just been made right. The
  fifth put the layout back and kept the fixes. **The lesson that cost the most:
  a fix and a redesign are different things, and shipping them together means
  the redesign cannot be undone without losing the fix.**
- **A chart that lied was caught before anyone saw it.** The cost waterfall
  stacked four bars and labelled the total £78,890 when the bars summed to
  £162,500 — true only because most of the purchase was borrowed. The fix was
  not a better chart but a check in the maths library that asks whether the
  parts genuinely sum, and draws a different picture when they do not.
- **A privacy promise was rewritten rather than quietly outlived.** The policy
  said packs were never stored and photographs never left the device. Saving
  packs made both false, so the policy now says what happens, says that it
  changed, and says that not pressing Save still behaves the old way.

### What nearly shipped and should not have

- A pack page that printed over its own footer, found by measuring rather than
  looking.
- A comparables page that cut the subject property out of its own comparison.
- A map that captured in our brand lime instead of the sourcer's colour.
- A "Share" button that opened AirDrop and Notes — the same fault as an earlier
  WhatsApp button, in a different costume, after the rule forbidding it had been
  narrowed to allow it. The rule is absolute again.
