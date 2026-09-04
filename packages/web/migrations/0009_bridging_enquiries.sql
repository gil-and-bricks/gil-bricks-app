-- F1: bridging enquiries. ADDITIVE ONLY (Reversibility charter rule 5).
-- D1 is the source of truth for an enquiry: it is written before Kit is ever
-- called, so a Kit outage can never lose one.
CREATE TABLE IF NOT EXISTS bridging_enquiries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  loan INTEGER NOT NULL,
  deposit_band TEXT NOT NULL,
  property_state TEXT NOT NULL,
  entity TEXT NOT NULL,
  exit_route TEXT NOT NULL,
  story TEXT NOT NULL,
  timing TEXT NOT NULL,
  credit TEXT NOT NULL,
  outcome TEXT NOT NULL,          -- 'qualified' | 'not-yet'
  reasons TEXT NOT NULL DEFAULT '', -- comma-joined stable keys
  consent_at TEXT NOT NULL,       -- when they ticked the box (lawful basis)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bridging_user ON bridging_enquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_bridging_outcome ON bridging_enquiries(outcome, created_at);
