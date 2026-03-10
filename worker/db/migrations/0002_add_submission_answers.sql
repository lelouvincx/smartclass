CREATE TABLE IF NOT EXISTS submission_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  q_id INTEGER NOT NULL,
  submitted_answer TEXT,
  is_correct INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (submission_id, q_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);
