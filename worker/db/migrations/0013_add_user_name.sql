-- Existing accounts remain nullable until the user or a teacher supplies a name.
ALTER TABLE users ADD COLUMN name TEXT;
