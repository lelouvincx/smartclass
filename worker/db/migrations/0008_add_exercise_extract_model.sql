-- v0.4: Per-exercise vision-LLM model for student image-extraction (PR C2).
-- Nullable: NULL means "use server default" (DEFAULT_EXTRACT_MODEL).
-- Validated against EXTRACT_MODELS allowlist at the API layer (not by the DB)
-- so we can extend the list without a migration.

ALTER TABLE exercises ADD COLUMN extract_model TEXT;
