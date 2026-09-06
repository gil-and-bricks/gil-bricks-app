# Deal pipeline — where we are (P9, 2026-09-06)

P5 SUPERSEDES the P4.2 pause: facts and re-scoring are now built, so the section that
called them deliberately deferred is gone. This records exactly what is built and what
is deliberately NOT, so nobody rebuilds finished work or half-builds
the deferred work by accident. Everything is behind `features.dealPipeline` (packages/web/src/config/features.ts — the ONE
flags file; docs/FEATURE_FLAGS.md is the rollback sheet)
(currently ON in production, gated on sign-in). Boundaries in CLAUDE.md are LOCKED:
buy-side only, ends at purchase; deals are born ONLY from an analyser payload.

## Built (do NOT rebuild)
- **Data layer (P1):** `deals`, `deal_stage_history`, `deal_facts`, `deal_verdicts`
  (migrations 0005–0008). 100-cap counts LIVE deals only. Saved-deal migration reused ids.
- **Stages (config-driven):** 7 progress stages + parked/dead, with per-stage dwell
  (normal/cold) and the one-line action verb — all in `src/config/pipeline.ts`, reword
  without a migration.
- **Save → pipeline (P2):** signed-in save writes a deal + first verdict snapshot;
  idempotent per property+strategy; no-manual-entry enforced by construction (branded
  `AnalyserDealPayload`, guardrail test).
- **The board (P3) at `/deals`:** verdict-first cards, stage columns (empty ones hidden),
  quiet live/terminal counter, mobile = single vertical list, desktop = columns.
- **Moves + quick actions (P4):** drag (desktop) + a native stage picker (keyboard +
  one-handed mobile), optimistic with per-deal rollback; skip allowed; park/kill with a
  one-chip reason; re-open the analyser by tapping the card.
- **Today line (P4):** one deal, one action, ranked date → stage-relative dwell → new
  unactioned → else "nothing needs you"; never contradicts an empty/terminal board.
- **Stage-aware ageing (P4):** amber past normal, "gone cold" past cold — never a
  blanket timer, no red alarm.
- **Verdict-first cards (P4.1):** score + colour + the analyser's OWN reason line
  (stored `verdict_line`), actionable next-step, terminal-state + layout fixes.
- **Score backfill (P4.2):** an unscored deal shows "Tap to score this" (or names the
  missing input); opening it scores it via the real analyser pipeline and persists the
  score to that deal by id. Auction warning at Offer in.
- **Dev seed set (P4.2):** `/dev/seed` + `/dev/seed/clear`, dev-only (impossible in
  production), a realistic spread for judging design — with realistic FACTS on five of
  the ten deals (P5), so a seeded card shows a fact-corrected score.
- **Facts + re-scoring (P5)** — BUILT. Eight fact types in `src/config/pipeline.ts`
  (`FACT_TYPES`); adding one is two taps and one number on the card. `applyFacts`
  (packages/web/src/lib/deals/facts.ts) turns facts into the analyser inputs they
  represent, then `scoreFromParams` (src/lib/deals/scoreFromParams.ts) re-scores in the
  BROWSER with the same @gil-bricks/core calls the analyser runs — no new formula, proved
  by facts.test.ts (a quote of £48,000 scores exactly as £48,000 typed, per strategy).
  Every re-score POSTs a `deal_verdicts` snapshot (score + criteria + evidence). Facts are
  listed on the card and deletable; deleting restores the previous score. Non-numeric
  facts (covenant, short lease) flag and explain — they never invent a cost. Behind
  `features.dealFacts`. Adding a fact type is a config edit, never code.
- **Stable identity + evidence-stable re-scoring (P5.1)** — BUILT. A deal's card link carries
  `deal=<id>`; the analyser sends it back, so re-saving a deal you opened from the board UPDATES
  it (stage and history kept) instead of creating a twin whose only difference was the numbers a
  fact had corrected. The sold-price band the saved score was judged against is stored on the deal
  (`deals.sold_evidence`, migration 0012) and passed back into the SAME `scoreDeal` argument on
  every re-score, so adding and removing a fact returns the deal to its saved score exactly.
  P6 closed the same gap for HMO ROOM SIZES (`deals.room_size_failures`, migration 0014), which
  live in the analyser page and never in the URL. The round trip is now exact EXCEPT on a deal
  saved before those columns existed: its band is unknown and cannot be reconstructed, so the
  card says so (only where the strategy actually scores sold prices) and one save fixes it.
  A save with NOTHING computed never blanks a score, a verdict line or the evidence behind them.
- **Verdict-change messaging (P6)** — BUILT, behind `features.verdictChanges`. When a fact moves a
  deal across a verdict band, or by a full point (`CHANGE_RULES` in src/config/pipeline.ts), the
  card says what it was, what landed, what it is now, and — in @gil-bricks/core's own words — what
  that means and what would fix it. It is stored (`deal_changes`, migration 0013) so it survives a
  reload, and it stays until dismissed; P8 can rank unacknowledged changes as urgent. A deal a fact
  has taken below walk-away is OFFERED a park with the reason pre-filled, and is never parked
  automatically. A closed **score history** opens a sparkline built from the `deal_verdicts`
  snapshots. Facts folded into a deal's own numbers are MARKED, never deleted (migration 0014).
  Three states: a band; `'null'` (no comparables, and we know it); SQL `NULL` (saved before the
  column existed — the card says so rather than guessing). A re-save FOLDS the applied facts into
  the deal's numbers, because the page was opened with them applied; flags and no-effect facts stay.

## Deliberately NOT built yet (return with fresh eyes — do not half-build)
- **Evidence chips** — showing which inputs were listing / EPC / estimated / typed on
  the card (data captured in `evidence_json`; not surfaced).
- **Extension reminders + calendar export** — nudges for a chased offer / booked viewing.
- **Chain-risk card at Offer accepted** — surfacing chain/searches risk in the legal phase.

- **Evidence chips (P7)** — BUILT, behind `features.evidenceChips`. A small strip under the Deal Score
  says what it rests on: Refurb, End value, Rent, Comps and Room sizes where each applies — filled when
  evidenced, outline when assumed, dashed when unknown — then one line naming the weakest input and the
  one thing that would fix it. The rules, the labels AND the sentence live in ONE place
  (`packages/core/src/evidence/chips.ts`), because the deal card, the analyser verdict and the extension
  panel all show them and must never disagree; a surface that cannot know something reports it as
  unknown rather than guessing. A fact fills its chip. There is no floor-area chip (no Deal Score reads
  one) and no comps chip on an HMO (its score has no sold-evidence component).
- **Deal identity (P7)** — a save now refuses to match a deal it cannot POSITIVELY identify: the
  postcode must match AND both sides must name the building. Two properties sharing a postcode with no
  house number make a new deal rather than overwriting the wrong one.

- **What needs you today (P8)** — BUILT. The today line ranks over four tiers, all in config
  (`URGENCY` in src/config/pipeline.ts): a date you set inside 48 hours, then an unacknowledged
  verdict change, then stage-aware staleness, then a decision resting on a guess at a stage that
  should know better. Ties go to the deal with the most money at stake. If nothing qualifies it says
  so — urgency is never manufactured. **Dated deadlines** finally exist (migration 0015): a chase
  date on any live deal, an auction date on an auction deal, an exchange date once the offer is
  accepted, set with the phone's own picker and behind `features.dealDates`. A **daily cron**
  (06:00 UTC, free tier) stamps each live deal's staleness with the SAME pure function the board
  runs — it computes and stores, it never notifies, and the app still sends no email. The board says
  so out loud under the line: it is here when you open it, and nothing is sent to you.

- **The dead-deal graveyard (P9)** — BUILT, behind `features.dealGraveyard`. Killing a deal takes one
  reason chip (eight, in `PARK_REASONS`) and an optional line, and the SERVER freezes the card as it
  died — score, the engine's own verdict line, the evidence chips, the facts it carried and the stage
  it reached (`deal_deaths`, migration 0016). The snapshot is written once and never updated, so a
  later rules change moves what a deal would score today, never what this one scored on the day you
  killed it; the WORDS around it still come from config, so rewording a stage or a reason re-words
  every headstone. The board gains a collapsed **Deals you killed** view: most recent first, with the
  reason, the note and the day. Dead deals have never counted against the 100 LIVE cap.
  A **pattern** is offered only above `GRAVEYARD.patternMin` (five) within the last
  `GRAVEYARD.patternWindow` (twenty) deaths, and it ALWAYS states its sample; below that it says
  plainly there is not enough to see. Reasons that carry no lesson ("Changed my mind", "Seller pulled
  out") state the sample and stop — a kill is never judged. **Bringing a deal back** restores it to
  the stage it died at, re-scores it against today's rules and KEEPS the death as history
  (`revived_at`), and it counts against the live cap again, so a full board refuses.
  P6's one-tap "Park it" lands here with the reason pre-filled and a real snapshot.

## Where to pick up
The board answers "what needs me?", a deal re-scores itself as the facts land, it SAYS when the
answer has changed, and the deals you killed are kept as the memory — with a pattern only when the
sample is real. P10 is next: the extension badge, which is the closest thing to a real reminder we
can honestly build, because the today line can only reach somebody who opens the site.
