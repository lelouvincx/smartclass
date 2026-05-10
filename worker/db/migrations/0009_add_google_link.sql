-- RFC-7: Google OAuth account link.
-- Add Google identity columns. Phone + password_hash stay NOT NULL —
-- Google is link-only, never primary identity.
-- See docs/plans/RFC-7-2026-05-10-google-oauth-login.md.
--
-- Columns (email, google_sub, google_email) were already added to users
-- via a prior D1 execute. This migration only adds the unique index.
-- ALTER TABLE statements omitted to avoid "duplicate column" errors.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users(google_sub) WHERE google_sub IS NOT NULL;
