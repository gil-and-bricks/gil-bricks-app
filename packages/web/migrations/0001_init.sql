-- S6.1 initial schema. D1 database gil-bricks-db, jurisdiction eu (EEUR).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  marketing_consent BOOLEAN NOT NULL DEFAULT 0,
  consent_ts TEXT,
  consent_version TEXT
);

CREATE TABLE IF NOT EXISTS saved_deals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL,
  title TEXT NOT NULL,
  url_params TEXT NOT NULL,
  key_figure TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_deals_user ON saved_deals(user_id);

CREATE TABLE IF NOT EXISTS kit_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_kit_outbox_status ON kit_outbox(status);
