-- S6.2 fix: the same property saved under two strategies must be two deals.
DROP INDEX IF EXISTS idx_saved_deals_user_params;
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_deals_user_strategy_params ON saved_deals(user_id, strategy, url_params);
