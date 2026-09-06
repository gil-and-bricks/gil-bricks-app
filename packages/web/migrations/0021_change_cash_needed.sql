-- D4: a fact can move the CASH YOU MUST FIND without moving the Deal Score.
-- A £25,000 builder's quote left a 7.0 at 7.0 while the money needed up front
-- went from £47,000 to £72,000, and the card said nothing. The change row now
-- carries both figures so the announcement is durable, exactly like the score.
-- Additive only: existing rows keep NULL and simply announce no cash line.
ALTER TABLE deal_changes ADD COLUMN from_cash INTEGER;
ALTER TABLE deal_changes ADD COLUMN to_cash INTEGER;
