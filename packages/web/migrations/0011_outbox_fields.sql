-- T3: the capture path. ADDITIVE ONLY (Reversibility charter rule 5).
-- A lead row carries the person's OWN figures to Kit as custom fields, so the
-- email Kit sends can give them their numbers back. NULL for every other action.
ALTER TABLE kit_outbox ADD COLUMN fields_json TEXT;
