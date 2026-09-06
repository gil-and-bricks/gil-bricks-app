-- P6 review. Two additive columns, both closing the same class of bug: a
-- re-score that quietly knows less than the save did, or destroys what it
-- replaced.
--
-- 1. deal_facts.folded_at — saving from a deal's own analyser page makes the
--    numbers on screen the deal's own, and those numbers already contain its
--    facts. Applying them again would double-count an added cost. P5.1 DELETED
--    them; that destroyed the record of why the deal moved, and the note the
--    person typed with it. They are MARKED now: still listed, no longer applied,
--    and nothing is lost.
-- 2. deals.room_size_failures — an HMO's Deal Score includes "rooms meet the
--    legal minimum sizes" (2.5 of 10). Those measurements live in the analyser
--    page, never in the URL, so a browser re-score scored them as UNMEASURED and
--    the score moved for a reason unrelated to the fact — the same defect
--    migration 0012 fixed for sold evidence. NULL means unmeasured (which is
--    also what the analyser shows), an integer is the number that failed.
ALTER TABLE deal_facts ADD COLUMN folded_at TEXT;
ALTER TABLE deals ADD COLUMN room_size_failures INTEGER;
