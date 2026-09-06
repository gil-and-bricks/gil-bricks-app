-- F2 review: the record that a disclosure happened must outlive the data.
--
-- The fact-find itself is deleted within days (that is the promise, and the cron
-- keeps it). But deleting it would also delete the only evidence that the person
-- consented, when, and to which version of the wording — and accountability for
-- a consent-based disclosure is exactly what you have to be able to show.
--
-- So the CONSENT EVENT is recorded on the enquiry, which the person controls and
-- which is kept until they delete it. No answer is duplicated here: just that it
-- happened, when, and under which policy version.
--
-- Additive only.
ALTER TABLE bridging_enquiries ADD COLUMN factfind_consent_at TEXT;
ALTER TABLE bridging_enquiries ADD COLUMN factfind_consent_version TEXT;
