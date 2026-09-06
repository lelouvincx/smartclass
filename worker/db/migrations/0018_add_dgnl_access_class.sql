CREATE TABLE student_grades_with_dgnl (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade IN (10, 11, 12, 'dgnl')),
  PRIMARY KEY (user_id, grade)
);

INSERT INTO student_grades_with_dgnl (user_id, grade)
SELECT user_id, grade FROM student_grades;

DROP TABLE student_grades;
ALTER TABLE student_grades_with_dgnl RENAME TO student_grades;

CREATE INDEX idx_student_grades_grade_user
  ON student_grades(grade, user_id);

CREATE TABLE exercise_grades_with_dgnl (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade IN (10, 11, 12, 'dgnl')),
  PRIMARY KEY (exercise_id, grade)
);

INSERT INTO exercise_grades_with_dgnl (exercise_id, grade)
SELECT exercise_id, grade FROM exercise_grades;

DROP TABLE exercise_grades;
ALTER TABLE exercise_grades_with_dgnl RENAME TO exercise_grades;

CREATE INDEX idx_exercise_grades_grade_exercise
  ON exercise_grades(grade, exercise_id);

CREATE TABLE lecture_grades_with_dgnl (
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade IN (10, 11, 12, 'dgnl')),
  PRIMARY KEY (lecture_id, grade)
);

INSERT INTO lecture_grades_with_dgnl (lecture_id, grade)
SELECT lecture_id, grade FROM lecture_grades;

DROP TABLE lecture_grades;
ALTER TABLE lecture_grades_with_dgnl RENAME TO lecture_grades;

CREATE INDEX idx_lecture_grades_grade_lecture
  ON lecture_grades(grade, lecture_id);
