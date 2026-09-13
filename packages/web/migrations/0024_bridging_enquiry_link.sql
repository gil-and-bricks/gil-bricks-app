-- F3: the broker's single-use link to a QUALIFIED enquiry's answers.
--
-- WHAT THIS FIXES. The consent tick beside the enquiry form says "Share these
-- answers and my contact details with [the broker]". Kit was only ever given an
-- email address and a first name, and there was no page anywhere that showed
-- him what was actually said — so the tick claimed a disclosure that never
-- happened. These three columns are the disclosure.
--
-- SAME SHAPE AS 0019. Only the SHA-256 hash of the token is stored, so a
-- database leak yields no working link; the link is single-use (link_viewed_at)
-- and expires (link_expires_at).
--
-- NULLABLE ON PURPOSE, and three states worth reading deliberately:
--   token_hash IS NULL  — no link: a not-yet enquiry, one sent before F3, or a
--                         link the retention sweep has cleared.
--   link_viewed_at NULL — minted, not yet read.
--   otherwise           — read, and dead from that moment.
--
-- THE SWEEP CLEARS THESE COLUMNS AND NOTHING ELSE. Unlike a fact-find, an
-- enquiry is not deleted on a timer: it is the person's own record, it carries
-- the consent evidence added in 0020, and the privacy policy says it is kept
-- until they delete it. Only the token has a short life.
--
-- Additive only (Reversibility charter rule 5).
ALTER TABLE bridging_enquiries ADD COLUMN token_hash TEXT;
ALTER TABLE bridging_enquiries ADD COLUMN link_expires_at TEXT;
ALTER TABLE bridging_enquiries ADD COLUMN link_viewed_at TEXT;
-- The broker's link resolves by hash, never by id.
CREATE INDEX IF NOT EXISTS idx_enquiry_token ON bridging_enquiries(token_hash);
