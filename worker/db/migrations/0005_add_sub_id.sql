PRAGMA foreign_keys = OFF;

-- Add sub_id column to answer_schemas for boolean sub-questions (a,b,c,d).
-- MCQ and numeric questions have sub_id = NULL.
-- Boolean questions have sub_id IN ('a','b','c','d') with correct_answer = '0' or '1'.
--
-- Uniqueness: COALESCE(sub_id, '') ensures (exercise_id, q_id, NULL) is still unique
-- because two NULLs are treated as equal via COALESCE.

CREATE TABLE answer_schemas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  q_id INTEGER NOT NULL,
  sub_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'boolean', 'numeric')),
  correct_answer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

-- Copy existing data (sub_id defaults to NULL for all existing rows)
INSERT INTO answer_schemas_new (id, exercise_id, q_id, type, correct_answer, created_at, updated_at)
  SELECT id, exercise_id, q_id, type, correct_answer, created_at, updated_at
  FROM answer_schemas;

DROP TABLE answer_schemas;
ALTER TABLE answer_schemas_new RENAME TO answer_schemas;

-- Unique index using COALESCE to handle NULLs correctly
CREATE UNIQUE INDEX idx_answer_schemas_unique
  ON answer_schemas(exercise_id, q_id, COALESCE(sub_id, ''));

-- Add sub_id column to submission_answers for boolean sub-questions.
CREATE TABLE submission_answers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  q_id INTEGER NOT NULL,
  sub_id TEXT,
  submitted_answer TEXT,
  is_correct INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

INSERT INTO submission_answers_new (id, submission_id, q_id, submitted_answer, is_correct, created_at)
  SELECT id, submission_id, q_id, submitted_answer, is_correct, created_at
  FROM submission_answers;

DROP TABLE submission_answers;
ALTER TABLE submission_answers_new RENAME TO submission_answers;

CREATE UNIQUE INDEX idx_submission_answers_unique
  ON submission_answers(submission_id, q_id, COALESCE(sub_id, ''));

PRAGMA foreign_keys = ON;
