# The deal pipeline — what exists (P11, 2026-09-06)

The pipeline is finished. This says what is built, what it is for, and what is
deliberately NOT built, so nobody rebuilds finished work or half-builds the work
that was left out on purpose.

Everything is behind flags in `packages/web/src/config/features.ts`
(`docs/FEATURE_FLAGS.md` is the rollback sheet). Every knob is in
`docs/PIPELINE_CONFIG.md`. The boundaries in CLAUDE.md are LOCKED: buy-side only,
it ends at purchase, and a deal can only be born from an analyser payload.

## The shape of it

A deal is a living estimate. It arrives from the analyser, it moves through
stages, it learns facts, it re-scores itself against the SAME maths the analyser
runs, and it says so when the answer changes. Most deals die, and the ones you
kill are kept as the memory. Nothing about it teaches, packages, sells or sends.

## Built

- **The data (P1, migrations 0005–0018).** `deals`, `deal_stage_history`,
  `deal_facts`, `deal_verdicts`, `deal_changes`, `deal_deaths`, plus the columns
  the later sprints added (sold evidence, room-size failures, four dates,
  staleness, the chain-risk acknowledgement). Every migration is additive; none
  has ever destroyed a row.
- **Stages (config-driven).** Seven progress stages plus parked/dead, each with
  its own dwell times, instruction and short verb. Rewording one needs no
  migration.
- **Save → pipeline (P2).** A signed-in save writes a deal and its first verdict
  snapshot. Idempotent per property + strategy. No manual entry exists, and the
  only deal-creating helper takes a branded analyser payload — a test fails
  loudly if a second `INSERT INTO deals` ever appears.
- **The board (P3/P4) at `/deals`.** Verdict-first cards, stage columns, drag or
  a native picker, optimistic moves with honest rollback, park/kill, a quiet
  counter, and an auction legal-pack warning at Offer in.
- **Facts and re-scoring (P5).** Nine fact types; two taps and a number on the
  card. A fact becomes exactly the analyser input a person could have typed, and
  the browser re-scores with `@gil-bricks/core` — no second pathway into the
  maths. Facts are listed, removable, and never invent a cost they cannot know.
- **Stable identity and evidence-stable re-scoring (P5.1/P6/P7).** A deal's card
  carries its own id, so re-saving updates it rather than making a twin; a save
  that cannot POSITIVELY identify a deal makes a new one instead of overwriting
  the wrong one. The sold-price band and the HMO room-size result travel with the
  deal, so a re-score is judged on the same evidence the saved score was.
- **Verdict-change messaging and score history (P6).** When a fact moves a deal
  across a band, or by a full point, the card says what it was, what landed, what
  it is now, and — in the engine's own words — what that means and what would fix
  it. It survives a reload and stays until dismissed. A closed sparkline shows
  the score at every evidence step.
- **Evidence chips (P7).** What a score RESTS on — refurb, end value, rent,
  comps, room sizes — filled, outline or dashed, from ONE shared source in
  `@gil-bricks/core` that the deal card, the analyser verdict and the extension
  panel all read.
- **What needs you today (P8).** One deal, one verb, ranked over four tiers in
  config: a dated deadline inside 48 hours, an unacknowledged change, stage-aware
  staleness, then a decision resting on a guess. If nothing qualifies it says so.
  Four dates a person can set, and a daily cron that stamps staleness and tells
  nobody.
- **The dead-deal graveyard (P9).** Killing a deal captures one reason chip, an
  optional note and a FROZEN snapshot of the card as it died. A pattern is
  offered only above a real threshold and always states its sample. A dead deal
  can come back to the stage it died at, re-scored against today's rules, with
  the death kept as history.
- **The extension badge and calendar export (P10).** A daily alarm asks the web
  app the same question the board asks and wears the count on the toolbar; at
  most one notification a day, only for a dated deadline still ahead. Any deal
  carrying a date exports an .ics built in the browser. The copy says the limit
  out loud: it works while Chrome is open, and nothing reaches you when it is
  closed.
- **Chain-risk honesty, the re-trade radar and paginated lists (P11).** A fixed
  honest card at Offer accepted — accepted is not safe, most wobbles are in the
  first four weeks, and here is what kills deals. When a survey or a valuation
  moves a live deal, the card shows the reverse-solved new maximum offer and a
  message you can copy to the agent (it copies; it never sends). The board loads
  every live deal plus a window of the bought and the killed, with counts taken
  from the database so a window can never make a number wrong.

## Deliberately NOT built

- **The chain-risk CARD is honesty, not tracking.** There is no chain tracker, no
  "who is in your chain", no solicitor chasing. It says the true thing once.
- **Nothing investor-facing.** No packaging, no deal packs, no sharing or
  sending, no investor CRM.
- **Nothing about owning.** The pipeline ends at purchase: no tenancies, no
  letting, no portfolio tracking, no tax returns.
- **No teaching layer.** No courses, badges, streaks or gamification.
- **No email, ever.** The app sends nothing. The today line reaches you when you
  open the board; the extension badge reaches you while Chrome is open; a
  calendar file reaches you because your own calendar took it over. Those are the
  only three, and each says so where it appears.
- **No second idea of "urgent", "good" or "evidenced".** One ranking, one score,
  one set of chips, shared by every surface.

## Known limits, stated

- A board re-score reads the postcode's own area for the country, not ONSPD, so a
  cross-border postcode (CH, HR, SY, WR) re-scores on SDLT where the analyser
  would use LTT.
- The attention endpoint ranks on the Worker's UTC clock while the board ranks on
  the reader's, so during BST a date's end-of-day differs by an hour. It moves
  only the boundary of a 48-hour window on a once-a-day check.
- A deal killed before P9 has no frozen snapshot; the graveyard says so rather
  than inventing one.

## Where to pick up

The pipeline is done. What is left is not more pipeline: it is the operator's
design pass (name, logo, colours — all tokenised and slot-ready), the ICO fee
before `/bridging-finance` goes public, and whatever the first real users ask
for. Every knob they might want turned is in `docs/PIPELINE_CONFIG.md`.
