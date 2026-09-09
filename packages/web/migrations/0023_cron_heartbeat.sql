-- 0023 — cron heartbeats, so a cron that stops running is visible (C3 follow-up).
--
-- The Kit outbox retry and the daily staleness stamp are the app's only
-- scheduled work. If Cloudflare stops firing a trigger, or the handler throws,
-- nothing anywhere notices: a bridging enquiry sits queued and the site looks
-- fine. Each cron now stamps its own row, and /api/health reads them.
--
-- ADDITIVE ONLY: a new table, nothing altered, nothing dropped.
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  name TEXT PRIMARY KEY,
  last_at TEXT NOT NULL
);

-- Seeded at migration time so a fresh deploy does not report "the daily cron has
-- never stamped" for its first 24 hours, which would be a true statement and a
-- useless alarm. The outbox cron overwrites its seed within 15 minutes; the
-- daily one by 06:00 UTC. After that these values are always real stamps.
INSERT INTO cron_heartbeat (name, last_at)
VALUES ('outbox', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       ('daily', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(name) DO NOTHING;
