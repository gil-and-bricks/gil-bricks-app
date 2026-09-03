-- P4.1: the board card must show the VERDICT, not just a figure — the analyser's own
-- one-line reason in the user's voice (e.g. "Just 6.5% back on the cash you'd tie up,
-- short of the 12% that makes the risk worth it"). That line is @gil-bricks/core's
-- DealScore.headline, computed with the deal's inputs + the user's own thresholds at
-- analyse time; it can't be honestly rebuilt on the board, so we store it. Nullable:
-- migrated/older deals have none and the card says "Re-open to score this" instead.
ALTER TABLE deals ADD COLUMN verdict_line TEXT;
