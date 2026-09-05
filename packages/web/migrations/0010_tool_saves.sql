-- T1: a saved tool answer. ADDITIVE ONLY (Reversibility charter rule 5).
-- Written only when a signed-in person taps "save this" AFTER seeing their
-- answer — the answer itself never touches the server.
CREATE TABLE IF NOT EXISTS tool_saves (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool TEXT NOT NULL,           -- registry slug, e.g. 'equity'
  inputs_json TEXT NOT NULL,    -- what they typed, so the figure can be re-made
  headline TEXT NOT NULL,       -- the figure they saw, formatted
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_saves_user ON tool_saves(user_id, created_at);
