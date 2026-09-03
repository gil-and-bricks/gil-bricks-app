-- P1: deal pipeline foundation. Replaces the flat saved-deals list with a living,
-- re-scored pipeline (buy-side only, ends at purchase). Stage/fact keys are stable;
-- their display copy lives in src/config/pipeline.ts. No new formulas — scoring
-- always reuses @gil-bricks/core. saved_deals is left intact and untouched.

-- The deal itself. current_score is NULLABLE: a deal is a living estimate whose
-- score is unknown until it is (re-)scored. status is live | dead | done.
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL,
  title TEXT NOT NULL,
  postcode_sector TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'worth-a-look',
  current_score REAL,
  status TEXT NOT NULL DEFAULT 'live',
  dead_reason TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Primary query: a user's LIVE deals, oldest-touched first (staleness). status is
-- in the key so the 100-LIVE-only cap count and the live list both use this index.
CREATE INDEX IF NOT EXISTS idx_deals_user_status_updated ON deals(user_id, status, updated_at);

-- Every stage move, in time order. from_stage is NULL for the very first entry.
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stage_history_deal_at ON deal_stage_history(deal_id, at);

-- Facts that arrive and drive re-scoring (fact_type is a config key). value_json
-- holds the fact's structured payload (e.g. a quote amount, a survey note).
CREATE TABLE IF NOT EXISTS deal_facts (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  fact_type TEXT NOT NULL,
  value_json TEXT NOT NULL,
  entered_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_deal_entered ON deal_facts(deal_id, entered_at);

-- A snapshot of the verdict each time the deal is scored: the score, the personal
-- criteria it was judged against, and the evidence it rested on. score is NULLABLE
-- (a migrated deal has no captured score — see below).
CREATE TABLE IF NOT EXISTS deal_verdicts (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  score REAL,
  criteria_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verdicts_deal_at ON deal_verdicts(deal_id, at);

-- ---- Idempotent migration of existing saved_deals into the pipeline ----
-- Reuse saved_deals.id as deals.id so re-running this INSERT adds nothing new
-- (WHERE NOT EXISTS on id). Every saved deal becomes a live deal at worth-a-look,
-- with the source recorded honestly. saved_deals is not modified or dropped.
INSERT INTO deals (id, user_id, strategy, title, postcode_sector, stage, current_score, status, dead_reason, source, created_at, updated_at)
SELECT sd.id, sd.user_id, sd.strategy, sd.title, '', 'worth-a-look', NULL, 'live', NULL, 'saved-deal-migration', sd.created_at, sd.created_at
FROM saved_deals sd
WHERE NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = sd.id);

-- One initial verdict snapshot per migrated deal. saved_deals never stored the
-- 0-10 Deal Score or the personal criteria, so we honestly record score = NULL
-- and criteria = {}, and preserve the analyser inputs (url_params) and the
-- display figure (key_figure) as evidence so NOTHING is lost. The deal gets a
-- real score the first time it is re-scored in the analyser.
INSERT INTO deal_verdicts (id, deal_id, score, criteria_json, evidence_json, at)
SELECT 'migv-' || sd.id, sd.id, NULL, '{}',
       json_object('source', 'saved-deal-migration', 'url_params', sd.url_params, 'key_figure', sd.key_figure),
       sd.created_at
FROM saved_deals sd
WHERE EXISTS (SELECT 1 FROM deals d WHERE d.id = sd.id)
  AND NOT EXISTS (SELECT 1 FROM deal_verdicts v WHERE v.id = 'migv-' || sd.id);
