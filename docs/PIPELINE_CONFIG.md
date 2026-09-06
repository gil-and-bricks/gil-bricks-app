# The pipeline's knobs — everything you can change without code

Written for you, not for a developer. Every knob below is a value in a file you
can edit. None of them need code changing, and none of them need a migration.

**How to change one:** open the file, change the value, save it. Then it has to
be rebuilt and shipped for the change to reach anybody:

- **A website knob** (everything under `packages/web` or `packages/core`) — run
  `npm run build` then `npx wrangler deploy` from `packages/web`, or ask for it.
- **An extension knob** (anything under `packages/extension`) — that is a
  different journey: rebuild it, then upload the new zip to the Chrome Web Store
  and wait for review. Nothing changes on anybody's toolbar until they do.

**One rule to keep you safe:** anything in `key:` is a NAME THE DATABASE STORES —
never change those. Everything else (labels, sentences, numbers) is yours.
The tests will tell you loudly if you change a key by accident.

---

## 1. The on/off switches

**Where:** `packages/web/src/config/features.ts`
**Full list with what "off" looks like:** `docs/FEATURE_FLAGS.md`

Every feature in the pipeline is behind one `true`/`false` here. Turning one off
is the rollback: no code change, no data lost, nothing to unpick. The ones that
belong to the pipeline are `dealPipeline`, `dealFacts`, `verdictChanges`,
`evidenceChips`, `dealDates`, `dealGraveyard`, `calendarExport`, `chainRisk` and
`retradeRadar`.

---

## 2. The stages a deal moves through

**Where:** `PROGRESS_STAGES` in `packages/web/src/config/pipeline.ts`

Each stage has five things you can change and one you cannot:

| Field | What it does |
|---|---|
| `key` | **Do not change.** The database stores this. |
| `label` | What the column is called on the board. |
| `todo` | The instruction on a card at this stage ("Chase the agent on your offer"). |
| `act` | The same instruction as a short verb for the today line ("Chase the agent on"). |
| `dwellNormalDays` | How long a deal can sit here before the card turns amber. |
| `dwellColdDays` | How long before it reads as gone cold. |

(There is also a `blurb` on each stage. Nothing renders it today — it is there
for a stage picker that was never built. Changing it changes nothing.)

**Change the dwell days and:** cards age differently, the today line's staleness
tier fires sooner or later, and the daily staleness stamp follows. Nothing else.
Set `dwellNormalDays: 0` and a stage never ages at all.

---

## 3. The facts a deal can learn

**Where:** `FACT_TYPES` in `packages/web/src/config/pipeline.ts`

Adding a fact is one entry here — no code. Each has:

- `key` — **do not change** (stored).
- `label`, `numberLabel`, `hint` — the words on the card and the entry form.
- `kind` — `'number'` (moves the maths) or `'flag'` (marks the deal, invents no cost).
- `applies` — which analyser input it becomes, per strategy, and whether it
  `replace`s that input or `add`s to it. A strategy left out of this map cannot
  be re-scored by the fact, and the card says so instead.
- `noEffect` / `flagNote` — what the deal says when the fact carries no maths.
- `retrade` — the opening sentence of the re-trade message, if this fact is one
  of the ones that opens the radar (see §8).

**Change `applies` and:** that fact starts (or stops) moving that strategy's
numbers. The re-score, the evidence chips and the change message all follow.

---

## 4. What needs you today

**Where:** `URGENCY` in `packages/web/src/config/pipeline.ts`

| Knob | What it does |
|---|---|
| `order` | The strict order the today line shouts in. Reorder it and the line follows. |
| `deadlineWithinHours` | How close a date has to be to count as urgent. Default 48. |
| `expectedEvidence` | Which evidence each stage should have by now. A deal missing one is the quietest kind of urgent. |
| `critical` | The ONE tier that earns a desktop notification from the extension (while Chrome is open — nothing reaches you when it is shut). Set it to `''` and the extension never notifies again. |
| `criticalMax` | How many deadlines the extension is told about at once. |

**Change `order` and:** the today line, and the extension badge that reads the
same ranking, change together. There is no second idea of "urgent" anywhere.

The extension's own timing lives in `packages/extension/src/attention.ts`:
`hour` (when the daily check runs, default 8am), `maxBadge` (the biggest number
the badge shows), `freshHours` (how long a count is worth showing) and
`rememberDeadlines` (how many deadlines it remembers having told you about).

---

## 5. Killing deals, and the graveyard

**Where:** `PARK_REASONS`, `GRAVEYARD` and `GRAVEYARD_COPY` in
`packages/web/src/config/pipeline.ts`

- **`PARK_REASONS`** — the chips you pick from when a deal dies. `key` is stored;
  `label` is what you see; `diedOn` is how the pattern line names it ("died on
  refurb cost"); `pattern` is the lesson, and a reason with none states the
  sample and stops. Add a reason: one line.
- **`GRAVEYARD.patternMin`** — how many dead deals must share a reason before a
  pattern is worth saying. Default 5. **Lower it and patterns appear sooner;
  raise it and the graveyard stays a museum for longer.**
- **`GRAVEYARD.patternWindow`** — how far back the pattern looks. Default 20.
- **`CHANGE_COPY.killReasonKey`** — which reason the "Park it" button on a killed
  deal pre-fills.

---

## 6. When the answer changing is news

**Where:** `CHANGE_RULES` in `packages/web/src/config/pipeline.ts`

- `onBandChange: true` — crossing green/amber/walk-away always announces.
- `minPoints: 1` — inside one band, how far the score must move to announce.

**Change these and:** more or fewer facts produce the "The answer changed" block,
and the extension's badge counts more or fewer unread changes. The score itself
never changes — only whether you are told.

---

## 7. Dates, and the calendar file

**Where:** `DEAL_DATES`, `CALENDAR` and `CALENDAR_ALARM` in
`packages/web/src/config/pipeline.ts`

- **`DEAL_DATES`** — the four dates a deal can carry. `key` is a database column
  (**do not change**); `label`, `add` and `noun` are words; `event` is what the
  calendar entry is called; `stages` limits where a date is offered; `auctionOnly`
  restricts it to auction deals. A date already set is always still shown and
  always clearable, even if it stops being offered.
- **`CALENDAR_ALARM`** — how long before the day the calendar file asks for a
  reminder. `-PT15H` is 9am the day before. Whether it fires at all is the
  calendar app's decision, and the copy says so.

---

## 8. The chain-risk card, and the re-trade radar

**Where:** `CHAIN_RISK` and `RETRADE` in `packages/web/src/config/pipeline.ts`

**`CHAIN_RISK`** is the "accepted is not safe" note.
- `stage` — where it appears (default `offer-accepted`).
- `heading`, `lead`, `window`, `causesLead`, `causes`, `source` — every word.
- **The rule for this copy:** approximate figures, described as approximate,
  about the market and never a prediction about one deal. If you find a source
  you are happy to stand behind, name it in `source`.

**`RETRADE`** is the radar that opens when a survey or a valuation lands.
- `facts` — which facts open it. Take one out and it stays shut for that fact.
- `floorTarget` — what a new offer aims at when the deal was already below your
  bar. Default `marginal`.
- `message` — the words you paste to the agent. Reword it in your own voice; the
  three figures are filled in for you.
- **It copies. It never sends.** Nothing in this product sends anything.

---

## 9. When the daily job runs

**Where:** `DAILY_CRON` in `packages/web/src/config/pipeline.ts`

`'0 6 * * *'` — 6am UTC, every day. It stamps each live deal's staleness and
does nothing else: **it never notifies anybody, and this app sends no email.**

**This is the one knob that needs a second edit:** the same expression is in
`packages/web/wrangler.jsonc` under `triggers.crons`, because that is what tells
Cloudflare when to call us. Change both, or a test fails telling you so.

---

## 10. How big the board is

**Where:** `MAX_LIVE_DEALS` and `BOARD_PAGE` in
`packages/web/src/config/pipeline.ts`

- **`MAX_LIVE_DEALS`** (100) — how many LIVE deals you can hold. Dead and bought
  deals never count against it. Change it and the cap, the counter and the
  at-cap refusal move together — but change `LIVE_CAP_MESSAGE` too, because it
  says the number out loud.
- **`BOARD_PAGE`** — how many bought and killed deals load with the board
  (`done`, `dead`) and how many arrive when you ask for more (`more`). **This
  never changes a count:** the numbers beside each list are counted in the
  database, so a window only changes how much is on screen. Keep `dead` at or
  above `GRAVEYARD.patternWindow`, or the pattern would read a partial sample —
  a test fails if you don't. Anything above 200 is capped at 200 per request, to
  keep one page from becoming the whole list again.

---

## 11. The words

Nearly every visible string in the pipeline is in
`packages/web/src/config/pipeline.ts`: `BOARD_COPY` (the board and its cards),
`TODAY_COPY` (the today line and the date controls), `CHANGE_COPY` (the
answer-changed block and the score history), `GRAVEYARD_COPY`, `CALENDAR`,
`CHAIN_RISK`, `RETRADE`, `LIVE_CAP_MESSAGE`, `FACT_NO_MATHS` and
`FACT_NO_EFFECT`.

Three exceptions, so you are not left hunting:

- The board's **signed-out and empty-board sentences** are in
  `packages/web/src/config/copy.ts` under `COPY.account` (they are shared with
  the account page).
- The **evidence chips' labels and their one line** are in
  `packages/core/src/evidence/chips.ts`, because the deal card, the analyser and
  the extension panel all say them about the same deal and must never disagree.
- The **auction legal-pack warning** is `COPY.account.auctionWarning`; the stage
  it appears at is `AUCTION_WARNING_STAGE` in `pipeline.ts`.

The extension's words are in `packages/extension/src/attention.ts`
(`ATTENTION_COPY`) and `packages/extension/src/opener.ts` (`OPENER_COPY`).

Two rules the tests enforce for you: nothing visible may run over two sentences
or about thirty words (verdict and lever lines are exempt — naming the binding
number is the point), and no new component may contain a typed-in string at all.

---

## 12. Your own bars — what counts as a good deal

**Where:** `thresholds` on each strategy in
`packages/core/src/strategies/index.ts`

These are the criteria the Deal Score is judged against — the ICR the lender
needs, the cashflow and ROI you want, the profit a flip has to make. **Change
these and everything moves at once:** every score, every verdict, the today
line's ranking, the evidence line, the re-trade radar's new maximum, and the
extension badge. Nothing else in the product decides what "good" means.

Tax rates live in `packages/core/src/rates.json`, dated, and need no code change
either — see `docs/MATHS.md`.

---

## 13. Identity

**Where:** `packages/core/src/config.ts` (`coreConfig`) and
`packages/web/src/site.config.ts` (`siteConfig`)

The product name, the maker credit, the web address, the social links and the
Chrome Web Store link. The name is read from ONE place by the website, the
extension and the calendar files, so renaming the product is a single edit.

---

## What is NOT a knob, and why

- **The verdict bands** (green at 8, amber at 6) live in `@gil-bricks/core` so
  the board, the analyser and the extension can never disagree about what a 6.4
  looks like. Change your `thresholds` instead — that is the knob for "what
  counts as good".
- **The maths.** Every figure comes from `@gil-bricks/core`. Nothing on a screen
  computes anything, which is why a config change can never quietly produce a
  different number in one place than another.
- **Stage, fact, reason and date KEYS.** They are what the database stores. The
  labels beside them are yours to reword as often as you like.
- **The 30-second rule, the two-sentence rule and the ratchet.** They are tests,
  not settings — they exist to stop the product getting wordy again.

Every knob on this page is checked by `packages/web/src/config/knobs.test.ts`,
which turns each one and asserts the product actually moved. If a knob ever
stops working, that test fails.
