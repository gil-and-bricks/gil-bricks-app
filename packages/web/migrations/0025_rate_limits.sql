-- S1: a sliding-window rate limit, for the one endpoint that spends a
-- third-party credential on behalf of an anonymous caller.
--
-- WHY THIS EXISTS. /api/epc is public by design: the analyser works signed-out,
-- and an EPC lookup is part of that. But on a cache MISS it calls the EPC
-- register using OUR bearer token. Nothing stopped a script sending thousands
-- of varied postcode+house-number pairs — every one a miss, every one a real
-- upstream call — until the register rate-limited us or revoked the token. The
-- feature would then be broken for everybody, and the fault would look like ours.
--
-- ONLY MISSES ARE COUNTED. A cache hit costs the register nothing, so it is not
-- charged against anybody's budget. That keeps the limit off the path real
-- people repeat (the same property, twice) and on the path only a script takes.
--
-- WINDOWS ARE BUCKETS, NOT A LOG. One row per (key, window) with a count, so a
-- busy minute is one UPDATE rather than a row per request — this table can never
-- grow into the thing it is protecting against. The cron sweeps old buckets.
--
-- Additive only (Reversibility charter rule 5).
CREATE TABLE IF NOT EXISTS rate_limits (
  -- "<bucket>:<identity>:<window start epoch seconds>"
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  -- When this bucket may be swept. Indexed, because the sweep reads only this.
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);
