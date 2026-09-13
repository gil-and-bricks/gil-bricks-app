-- R3: which refurb pointers a person has already been shown.
--
-- WHY IT EXISTS. A tip must never repeat, across sessions and across properties:
-- by the tenth deal nobody should be seeing the same five pointers. Signed out
-- the browser remembers; signed in this does, so it follows them to another
-- device, and the two are merged on sign-in so nothing seen either way returns.
--
-- WHAT IT HOLDS. A user id and a cue key. No photo, no URL, no property, no
-- listing — which cue was shown to whom, and nothing else. It is deliberately
-- not tied to a deal: the promise is "never show ME this twice", not "never
-- show me this twice on THIS property".
--
-- SIZE. Forty cues is forty rows per user, for ever — the table is bounded by
-- the size of the library, not by usage. A user who analyses a thousand deals
-- still has at most one row per cue.
--
-- WRITES. One batched write per session, never one per tip.
--
-- Additive only (Reversibility charter rule 5).
CREATE TABLE IF NOT EXISTS refurb_cue_seen (
  user_id TEXT NOT NULL,
  cue_key TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cue_key)
);
CREATE INDEX IF NOT EXISTS idx_refurb_cue_seen_user ON refurb_cue_seen(user_id);
