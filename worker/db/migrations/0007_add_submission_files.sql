PRAGMA foreign_keys = ON;

-- Store student-uploaded files (answer sheet images for v0.4 image extraction)
-- Mirrors exercise_files; cascades on submission delete to keep R2 bookkeeping consistent.
CREATE TABLE IF NOT EXISTS submission_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('answer_sheet')),
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission ON submission_files(submission_id);
