-- P4: auction deals must surface the legal-pack warning unmissably when they reach
-- Offer in (losing your deposit at auction is a real risk). Auction is detected on
-- the listing (extension) and carried through the analyser handoff; we store it on
-- the deal so the board can warn on it. Sticky once true — a later re-save never
-- un-flags an auction. Defaults 0 for every existing/migrated deal.
ALTER TABLE deals ADD COLUMN is_auction INTEGER NOT NULL DEFAULT 0;
