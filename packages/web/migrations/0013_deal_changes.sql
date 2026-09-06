-- P6: VERDICT-CHANGE MESSAGING. When a fact moves a deal's score across a
-- meaningful threshold, the deal has to SAY so — and keep saying so until the
-- person has seen it. That means the change outlives the browser tab, so it is
-- stored here rather than held in memory.
--
-- We store the FACTS OF THE CHANGE, never the finished sentence: the wording
-- lives in src/config/pipeline.ts (CHANGE_COPY) so any word can be reworded
-- without a migration, and old changes are reworded with it.
--
-- to_verdict_line is the exception, and deliberately so: it is @gil-bricks/core's
-- OWN sentence at that moment (the consequence and the fix), which cannot be
-- rebuilt later without re-running the analysis on inputs that have since moved.
CREATE TABLE IF NOT EXISTS deal_changes (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  /** The fact that caused it (FACT_TYPES key) and the number it carried. */
  fact_type TEXT NOT NULL,
  fact_value REAL,
  /** What that number replaced or was added to, so the line can say "you'd put X". */
  previous_value REAL,
  from_score REAL NOT NULL,
  to_score REAL NOT NULL,
  /** The engine's own verdict line AFTER the change: the consequence and the fix. */
  to_verdict_line TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  /** NULL until the person has seen it. P8 ranks unacknowledged changes as urgent. */
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_changes_deal_ack ON deal_changes(deal_id, acknowledged_at);
