-- DP4: a pack that is ATTACHED TO THE DEAL, and a link that can be sent.
--
-- WHY THIS EXISTS AT ALL. "Save" used to download a file to the sourcer's
-- computer, which is not saving — come back tomorrow and the pack is gone, and
-- the deal card gave no sign one had ever been made. And "Share" opened the
-- operating system's share sheet, because a 1.7MB file cannot be handed to
-- WhatsApp or to an email client any other way: wa.me carries `text` and
-- nothing else (text/html is not even a sendable WhatsApp document type), and
-- RFC 6068 has no concept of an attachment — the word does not appear in it.
--
-- Both faults have ONE fix. A saved pack has a URL, and a URL is the one thing
-- both WhatsApp and a mail client will carry. So saving is what makes direct
-- sharing possible, and this table is the join between them.
--
-- WHAT IS STORED, AND WHERE.
--   D1 (here): the pointer and the permission — which deal, whose, the hash of
--   the share token, and when. Small, relational, queried on every board load
--   so a card can show that a pack exists.
--   R2: the pack's own contents — the chosen sections, their order, the
--   sourcer's words, and their photographs. D1 is the wrong home for that: its
--   maximum SQL statement is 100,000 bytes and a free database is capped at
--   500 MB, so a few photographs per deal would exhaust it. R2 has no egress
--   charge and a 10 GB free tier.
--
-- THE TOKEN IS NEVER STORED. Only SHA-256 of it. A leaked copy of this table
-- yields no working links. The token is 16 bytes from crypto.getRandomValues
-- (128 bits), generated in the Worker so the client cannot choose its own, and
-- it is a bearer credential: whoever holds the link can read the pack. That is
-- the point — an investor has no account here — and it is why the row can be
-- deleted to revoke it.
--
-- STILL NO UPLOAD. The photographs arrive as JSON data URIs on a normal POST,
-- exactly as the logo does (0028). The Worker still never calls formData(), and
-- the test asserting that stays as strict as it is.
--
-- Additive only (Reversibility charter rule 5). Deleted with the deal, and with
-- the account, alongside everything else.

CREATE TABLE IF NOT EXISTS deal_packs (
  -- One saved pack per deal. Saving again replaces it, and keeps the token so
  -- a link already sent to an investor does not die when the sourcer edits.
  deal_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- SHA-256 of the share token, hex. Never the token itself.
  token_hash TEXT NOT NULL,
  -- The R2 key holding the pack's contents.
  r2_key TEXT NOT NULL,
  -- Bytes stored, so the board can be honest about what it is holding and a
  -- runaway pack is visible without fetching it.
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- The link lookup: one row, by hash, on every view of a shared pack.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_packs_token ON deal_packs(token_hash);
-- The board asks "which of these deals have a pack?" once per load.
CREATE INDEX IF NOT EXISTS idx_deal_packs_user ON deal_packs(user_id);
