-- P8: WHAT NEEDS YOU TODAY.
--
-- Three DATES the person sets, so the urgency ranking's top tier is real rather
-- than theoretical (P4 built the seam; nothing ever filled it):
--   chase_date     any deal — "chase this on Thursday"
--   auction_date   only where the deal is flagged as an auction
--   exchange_date  only once the offer is accepted and exchange is in sight
-- All ISO dates (YYYY-MM-DD), all nullable, none of them ever set by the app.
--
-- And the DAILY STAMP: a Cloudflare cron writes each live deal's stage-aware
-- staleness once a day, so a surface that cannot compute it (the extension badge
-- in P10, any server-side query) can read it. The board still computes the same
-- value from the same pure function on load, so it is never a day behind on
-- screen — the stamp is an index, never a second source of truth.
ALTER TABLE deals ADD COLUMN chase_date TEXT;
ALTER TABLE deals ADD COLUMN auction_date TEXT;
ALTER TABLE deals ADD COLUMN exchange_date TEXT;
ALTER TABLE deals ADD COLUMN stale_state TEXT;
ALTER TABLE deals ADD COLUMN stale_at TEXT;
CREATE INDEX IF NOT EXISTS idx_deals_stale ON deals(user_id, status, stale_state);
