-- E1: the EPC register lookup cache.
--
-- WHY A CACHE. The register is queried live, and a certificate does not change
-- once it is lodged. Without this, every retyped address is two more calls to a
-- government API that publishes a rate limit; with it, the common case costs
-- nothing at all. It holds no personal data: a postcode, a house number and a
-- floor area that is already public on the register's own website.
--
-- WHY MISSES ARE CACHED TOO, BUT BRIEFLY. "No certificate here" is a real
-- answer worth remembering for a fortnight, but not for ever — a property can
-- be certified at any time. The two lifetimes are in src/config/epc.ts.
--
-- WHAT IS NEVER CACHED. Our own failures. If the register was unreachable or
-- rate-limited us, that says nothing about the address, and storing it would
-- turn a passing outage into a fortnight of wrong answers.
--
-- Additive only. Dropping this table loses nothing but speed.
CREATE TABLE IF NOT EXISTS epc_cache (
  cache_key  TEXT PRIMARY KEY,
  postcode   TEXT NOT NULL,
  payload    TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- The sweeper deletes by age; the lookup reads by key (the primary key above).
CREATE INDEX IF NOT EXISTS idx_epc_cache_fetched ON epc_cache (fetched_at);
