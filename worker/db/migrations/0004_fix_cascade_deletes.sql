PRAGMA foreign_keys = OFF;

-- Fix answer_schemas to add ON DELETE CASCADE
-- SQLite doesn't support ALTER TABLE for foreign keys, so we recreate the table

-- Create new table with correct foreign key
CREATE TABLE answer_schemas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  q_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'boolean', 'numeric')),
  correct_answer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exercise_id, q_id),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

-- Copy data
INSERT INTO answer_schemas_new SELECT * FROM answer_schemas;

-- Drop old table
DROP TABLE answer_schemas;

-- Rename new table
ALTER TABLE answer_schemas_new RENAME TO answer_schemas;

PRAGMA foreign_keys = ON;
