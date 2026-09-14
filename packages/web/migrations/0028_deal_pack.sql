-- DP1: the investor deal pack — the sourcer's own identity, and their declaration.
--
-- TWO TABLES BECAUSE THEY ARE TWO DIFFERENT KINDS OF THING.
--
-- `business_profiles` is MUTABLE. A business name, one accent colour and a
-- logo, changed whenever they like, applied to every pack they make.
--
-- `pack_declarations` is a ONE-OFF EVENT and is written once. It records that
-- this person confirmed they understand property sourcing is estate agency work
-- in the UK, and the registrations they hold. It carries the VERSION of the
-- wording they agreed to, for the same reason the fact-find consent record does
-- (0020): the words change over time and "they agreed" means nothing unless you
-- can say agreed to what. No declaration, no pack.
--
-- WHY THE LOGO IS A DATA URI AND NOT A FILE.
-- This app has no file upload and no R2 binding on the Worker, and the privacy
-- policy's "There is no upload" promise — scoped to the broker fact-find and a
-- credit report — is enforced by a test asserting the Worker never calls
-- formData(). A logo arrives as a JSON string instead: same bytes, no multipart
-- parser, no new attack surface, and that test stays exactly as strict as it is.
-- Capped in the route, not here, so the limit is one number in one place.
--
-- SIZE. A logo at the cap is 64 KB. D1's free tier is 5 GB, so ten thousand
-- users with a logo each is about 640 MB — inside it, with room to spare. The
-- PHOTOGRAPHS in a pack are never stored: they are chosen in the browser at the
-- moment the pack is made and printed in the same sitting. See
-- docs/DECISIONS_LOG.md (DP1).
--
-- Additive only (Reversibility charter rule 5). Both are deleted explicitly by
-- handleDeleteAccount alongside everything else (S1).

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id TEXT PRIMARY KEY,
  -- Printed on every pack. Empty is allowed here and handled by the pack, which
  -- prints "Registration details not provided" rather than hiding the gap.
  business_name TEXT NOT NULL DEFAULT '',
  -- One accent colour, as #rrggbb. Validated in the route; the pack falls back
  -- to its neutral default when this is empty or unreadable.
  accent_colour TEXT NOT NULL DEFAULT '',
  -- data:image/...;base64,... — capped in the route.
  logo_data_uri TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pack_declarations (
  user_id TEXT PRIMARY KEY,
  -- HMRC anti-money-laundering supervision reference.
  hmrc_aml_ref TEXT NOT NULL DEFAULT '',
  -- The redress scheme they belong to, and their membership number.
  redress_scheme TEXT NOT NULL DEFAULT '',
  redress_number TEXT NOT NULL DEFAULT '',
  -- Information Commissioner's Office registration.
  ico_registration TEXT NOT NULL DEFAULT '',
  -- Professional indemnity insurance: who with, and when it runs out.
  pi_insurer TEXT NOT NULL DEFAULT '',
  pi_expiry TEXT NOT NULL DEFAULT '',
  -- When they agreed, and to WHICH wording. Both, or neither means anything.
  declared_at TEXT NOT NULL,
  declaration_version TEXT NOT NULL
);
