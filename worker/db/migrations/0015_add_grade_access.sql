PRAGMA foreign_keys = ON;

CREATE TABLE student_grades (
  user_id INTEGER NOT NULL,
  grade INTEGER NOT NULL CHECK (grade IN (10, 11, 12)),
  PRIMARY KEY (user_id, grade),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_student_grades_grade_user
  ON student_grades(grade, user_id);

CREATE TABLE exercise_grades (
  exercise_id INTEGER NOT NULL,
  grade INTEGER NOT NULL CHECK (grade IN (10, 11, 12)),
  PRIMARY KEY (exercise_id, grade),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE INDEX idx_exercise_grades_grade_exercise
  ON exercise_grades(grade, exercise_id);

CREATE TABLE lecture_grades (
  lecture_id INTEGER NOT NULL,
  grade INTEGER NOT NULL CHECK (grade IN (10, 11, 12)),
  PRIMARY KEY (lecture_id, grade),
  FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
);

CREATE INDEX idx_lecture_grades_grade_lecture
  ON lecture_grades(grade, lecture_id);

-- Existing records keep the access they had before grade filtering was introduced.
INSERT INTO student_grades (user_id, grade)
SELECT id, grade
FROM users
CROSS JOIN (SELECT 10 AS grade UNION ALL SELECT 11 UNION ALL SELECT 12)
WHERE role = 'student' AND status = 'active';

INSERT INTO exercise_grades (exercise_id, grade)
SELECT id, grade
FROM exercises
CROSS JOIN (SELECT 10 AS grade UNION ALL SELECT 11 UNION ALL SELECT 12);

INSERT INTO lecture_grades (lecture_id, grade)
SELECT id, grade
FROM lectures
CROSS JOIN (SELECT 10 AS grade UNION ALL SELECT 11 UNION ALL SELECT 12);
