PRAGMA defer_foreign_keys = on;

-- Add ON DELETE CASCADE to submissions.exercise_id so deleting an exercise
-- also deletes its submissions.
CREATE TABLE submissions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  user_id INTEGER,
  mode TEXT NOT NULL CHECK (mode IN ('timed', 'untimed', 'guest')),
  score REAL,
  total_questions INTEGER,
  started_at TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO submissions_new
  SELECT * FROM submissions;

DROP TABLE submissions;
ALTER TABLE submissions_new RENAME TO submissions;

-- Add ON DELETE CASCADE to submission_answers.submission_id so deleting a
-- submission also deletes its answers.
CREATE TABLE submission_answers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  q_id INTEGER NOT NULL,
  sub_id TEXT,
  submitted_answer TEXT,
  is_correct INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

INSERT INTO submission_answers_new
  SELECT * FROM submission_answers;

DROP TABLE submission_answers;
ALTER TABLE submission_answers_new RENAME TO submission_answers;

CREATE UNIQUE INDEX idx_submission_answers_unique
  ON submission_answers(submission_id, q_id, COALESCE(sub_id, ''));

PRAGMA defer_foreign_keys = off;
