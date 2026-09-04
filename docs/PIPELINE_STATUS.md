# Deal pipeline — where we stopped (P4.2, 2026-09-04)

We stopped here **on purpose** to come back with fresh eyes. This records exactly what
is built and what is deliberately NOT, so nobody rebuilds finished work or half-builds
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
  production), a realistic spread for judging design.

## Deliberately NOT built yet (return with fresh eyes — do not half-build)
- **Facts + re-scoring as evidence arrives** — the spine: a builder's quote / survey
  finding / down-valuation lands, the deal RE-SCORES (reusing @gil-bricks/core, no new
  formulas), and a new `deal_verdicts` snapshot records the change. Tables exist
  (`deal_facts`, config `FACT_TYPES`); the capture UI + re-score trigger do not.
- **Verdict-change messaging** — "this dropped from Green to Amber because the survey
  found damp" when a fact moves the score.
- **Evidence chips** — showing which inputs were listing / EPC / estimated / typed on
  the card (data captured in `evidence_json`; not surfaced).
- **The dead-deal graveyard with patterns** — a proper P9 view of parked deals that
  learns "you keep killing deals for X". Today parked is just a collapsed list.
- **Extension reminders + calendar export** — nudges for a chased offer / booked viewing.
- **Chain-risk card at Offer accepted** — surfacing chain/searches risk in the legal phase.

## Why we stopped
The board now answers "what needs me?" and is usable end-to-end. The next layer
(facts → re-scoring) is the real depth and deserves a fresh, deliberate design pass
rather than being bolted on. Pick up from "Facts + re-scoring" above.
