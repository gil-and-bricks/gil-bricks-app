-- P9: THE DEAD DEAL GRAVEYARD.
--
-- A dead deal is not a failure, it is filtering that worked — and it is the most
-- useful memory this product holds. Until now a kill stored one free-text reason
-- on the deal and nothing else, so the card that died was gone the moment the
-- numbers moved on.
--
-- This table freezes the death itself:
--   reason_key     a STABLE PARK_REASONS key (the label is config, and reworded
--                  labels must reword old headstones too)
--   note           the optional one line the person typed, never required
--   snapshot_json  the card AS IT DIED — score, the engine's own verdict line,
--                  the evidence chips, the facts it carried and the stage it
--                  reached. It is written once and never updated, so it stays
--                  true even after the maths, the thresholds or the chip rules
--                  change. (Copy is NOT frozen: the words come from config, so
--                  a reworded stage or reason re-words every headstone.)
--   revived_at     set when the deal comes back (sellers return, chains re-form).
--                  The death is KEPT, never deleted — it is the history.
--
-- Additive only. Nothing is dropped, nothing is rewritten: deals killed before
-- this migration keep `deals.dead_reason` and simply have no snapshot, which the
-- graveyard says out loud rather than papering over.
CREATE TABLE IF NOT EXISTS deal_deaths (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  reason_key TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL,
  revived_at TEXT
);
-- The graveyard reads a user's deaths newest first, and the revive path reads the
-- one live death on a deal.
CREATE INDEX IF NOT EXISTS idx_deaths_deal_at ON deal_deaths(deal_id, at);
CREATE INDEX IF NOT EXISTS idx_deaths_open ON deal_deaths(deal_id, revived_at);
