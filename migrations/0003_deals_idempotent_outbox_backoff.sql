-- S6.2: idempotent saves (one row per user+params) + outbox retry timestamps.
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_deals_user_params ON saved_deals(user_id, url_params);
ALTER TABLE kit_outbox ADD COLUMN last_attempt TEXT;
