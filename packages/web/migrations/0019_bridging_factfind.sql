-- F2: the broker's fact-find.
--
-- WHAT THIS IS. F1 asks about the DEAL, to decide whether an enquiry is worth
-- the broker's time. This is his own form, asked after that filter passes: it is
-- about the BORROWER, because it is what he needs to go and get quotes.
--
-- WHY IT IS NOT IN kit_outbox. This is date of birth, home address and a credit
-- answer. Kit is a marketing platform: personal data of this kind must never be
-- put in one, and it must never travel in the body of a marketing email. The
-- answers live here; the broker is notified with a single-use, expiring link and
-- reads them from us. See docs/DECISIONS_LOG.md (F2).
--
-- NO CREDIT REPORT FILE. His own form takes an upload; ours asks only whether
-- one is available. A stored credit report is the most damaging single thing
-- this product could leak, he needs it at full fact-find anyway, and it belongs
-- on the regulated party's system, not ours.
--
-- RETENTION. Rows are deleted by the existing cron: shortly after the broker has
-- read one, and in any case after the maximum age in src/config/bridging.ts.
-- Additive only; nothing here is ever updated except the two link columns.
CREATE TABLE IF NOT EXISTS bridging_factfinds (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  -- contact, from the account and the enquiry (never re-typed by the person)
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  -- the broker's own questions
  applicant_name TEXT NOT NULL,
  buying_ltd TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL,
  address TEXT NOT NULL,
  owns_home TEXT NOT NULL,
  mortgage_provider TEXT NOT NULL DEFAULT '',
  other_properties TEXT NOT NULL,
  refurb_experience TEXT NOT NULL,
  good_credit TEXT NOT NULL,
  credit_report TEXT NOT NULL DEFAULT '',
  savings TEXT NOT NULL,
  deposit_source TEXT NOT NULL,
  gift_from TEXT NOT NULL DEFAULT '',
  equity_property TEXT NOT NULL DEFAULT '',
  -- lawful basis, and the one-time link
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  viewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_factfind_user ON bridging_factfinds(user_id);
-- The broker's link resolves by hash, never by id.
CREATE INDEX IF NOT EXISTS idx_factfind_token ON bridging_factfinds(token_hash);
-- The retention sweep reads these two.
CREATE INDEX IF NOT EXISTS idx_factfind_age ON bridging_factfinds(created_at);
CREATE INDEX IF NOT EXISTS idx_factfind_viewed ON bridging_factfinds(viewed_at);
