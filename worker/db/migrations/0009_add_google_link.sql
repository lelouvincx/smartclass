-- RFC-7: Google OAuth account link.
-- Add Google identity columns. Phone + password_hash stay NOT NULL —
-- Google is link-only, never primary identity.
-- See docs/plans/RFC-7-2026-05-10-google-oauth-login.md.

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN google_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users(google_sub) WHERE google_sub IS NOT NULL;
