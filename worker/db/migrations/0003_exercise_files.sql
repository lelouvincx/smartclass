PRAGMA foreign_keys = ON;

-- Store multiple files per exercise (PDFs, images, solutions)
CREATE TABLE IF NOT EXISTS exercise_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('exercise_pdf', 'solution_pdf', 'reference_image')),
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exercise_files_exercise ON exercise_files(exercise_id);
