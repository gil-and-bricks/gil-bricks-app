-- kit_outbox: separate WHAT to do (action) from delivery lifecycle (status).
ALTER TABLE kit_outbox ADD COLUMN action TEXT NOT NULL DEFAULT 'sync';
