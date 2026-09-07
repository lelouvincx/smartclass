ALTER TABLE users ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'standard'
  CHECK (access_tier IN ('standard', 'vip'));

ALTER TABLE lectures ADD COLUMN minimum_access_tier TEXT NOT NULL DEFAULT 'standard'
  CHECK (minimum_access_tier IN ('guest', 'standard', 'vip'));
