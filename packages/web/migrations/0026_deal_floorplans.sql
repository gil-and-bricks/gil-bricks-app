-- F1: the floor plan a user drew for a deal. GEOMETRY ONLY.
--
-- WHAT IS AND IS NOT HERE. Points, walls, rooms, names, levels and the scale —
-- a few kilobytes of JSON. NOT the agent's floorplan image, not its bytes, not
-- a thumbnail, not a data URI. That image is the agent's copyright; the browser
-- displays it from THEIR server while the user is drawing, and nothing of it is
-- ever fetched, held or stored by us. Storing geometry rather than pixels is
-- also what lets a saved plan re-open and render when the backdrop has gone.
--
-- ONE PLAN PER DEAL, so the deal id is the primary key: re-saving replaces,
-- which is what "the plan of this property" means. Cascades with the deal, and
-- account deletion removes it explicitly alongside everything else (S1).
--
-- SIZE. A ten-room, two-level plan is about 2 KB of JSON. D1's free tier is
-- 5 GB; at 2 KB a plan that is well over a million plans, so this line item
-- never becomes a cost. See docs/DECISIONS_LOG.md (F1) for the arithmetic.
--
-- Additive only (Reversibility charter rule 5).
CREATE TABLE IF NOT EXISTS deal_floorplans (
  deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  -- The SavedPlan shape from src/floorplan/plan.ts, versioned in its own `v`.
  geometry_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deal_floorplans_user ON deal_floorplans(user_id);
