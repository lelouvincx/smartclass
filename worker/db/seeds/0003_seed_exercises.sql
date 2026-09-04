pragma foreign_keys = on;

-- Canonical content from remote D1. Exercise-file rows are excluded because
-- their referenced R2 objects are not present in a fresh Orb's local emulator.
insert into exercises (
  id
  , title
  , duration_minutes
  , pdf_key
  , created_by
  , extract_model
  , created_at
  , updated_at
)
values
  (6, 'Test 1', 120, null, (select id from users where phone = '+84865481769'), null, '2026-03-15 17:43:32', '2026-03-15 17:43:32')
  , (7, 'Test 2', 60, null, (select id from users where phone = '+84865481769'), null, '2026-03-15 17:44:45', '2026-03-15 17:44:45')
  , (8, 'Test 3', 0, null, (select id from users where phone = '+84865481769'), null, '2026-03-16 07:14:14', '2026-03-16 07:14:14')
  , (9, 'Test 4', 60, null, (select id from users where phone = '+84865481769'), null, '2026-03-16 07:25:18', '2026-03-16 11:59:39')
on conflict(id) do update set
  title = excluded.title
  , duration_minutes = excluded.duration_minutes
  , pdf_key = excluded.pdf_key
  , created_by = excluded.created_by
  , extract_model = excluded.extract_model
  , created_at = excluded.created_at
  , updated_at = excluded.updated_at;

insert or ignore into exercise_grades (exercise_id, grade)
select exercises.id, grades.grade
from exercises
cross join (
  select 10 as grade
  union all select 11
  union all select 12
) as grades
where exercises.id in (6, 7, 8, 9);

delete from answer_schemas
where exercise_id in (6, 7, 8, 9);

insert into answer_schemas (exercise_id, q_id, sub_id, type, correct_answer)
values
  (6, 1, null, 'mcq', 'B')
  , (6, 2, null, 'mcq', 'B')
  , (6, 3, null, 'mcq', 'A')
  , (6, 4, null, 'mcq', 'B')
  , (6, 5, null, 'mcq', 'C')
  , (6, 6, null, 'mcq', 'B')
  , (6, 7, null, 'mcq', 'C')
  , (6, 8, null, 'mcq', 'B')
  , (6, 9, null, 'mcq', 'C')
  , (6, 10, null, 'mcq', 'B')
  , (6, 11, null, 'mcq', 'A')
  , (6, 12, null, 'mcq', 'D')
  , (6, 13, null, 'mcq', 'D')
  , (6, 14, null, 'mcq', 'B')
  , (6, 15, null, 'mcq', 'A')
  , (6, 16, null, 'mcq', 'A')
  , (6, 17, null, 'mcq', 'A')
  , (6, 23, null, 'numeric', '48')
  , (6, 24, null, 'numeric', '37')
  , (6, 25, null, 'numeric', '66.6')
  , (7, 1, null, 'mcq', 'B')
  , (7, 2, null, 'mcq', 'B')
  , (7, 3, null, 'mcq', 'A')
  , (7, 4, null, 'mcq', 'B')
  , (7, 5, null, 'mcq', 'C')
  , (7, 6, null, 'mcq', 'B')
  , (7, 7, null, 'mcq', 'C')
  , (7, 8, null, 'mcq', 'B')
  , (7, 9, null, 'mcq', 'C')
  , (7, 10, null, 'mcq', 'B')
  , (7, 11, null, 'mcq', 'A')
  , (7, 12, null, 'mcq', 'D')
  , (7, 13, null, 'mcq', 'D')
  , (7, 14, null, 'mcq', 'B')
  , (7, 15, null, 'mcq', 'A')
  , (7, 16, null, 'mcq', 'A')
  , (7, 17, null, 'mcq', 'A')
  , (7, 23, null, 'numeric', '48')
  , (7, 24, null, 'numeric', '37')
  , (7, 25, null, 'numeric', '66.6')
  , (8, 1, null, 'mcq', 'B')
  , (8, 2, null, 'mcq', 'B')
  , (8, 3, null, 'mcq', 'A')
  , (8, 4, null, 'mcq', 'B')
  , (8, 5, null, 'mcq', 'C')
  , (8, 6, null, 'mcq', 'B')
  , (8, 7, null, 'mcq', 'C')
  , (8, 8, null, 'mcq', 'B')
  , (8, 9, null, 'mcq', 'C')
  , (8, 10, null, 'mcq', 'B')
  , (8, 11, null, 'mcq', 'A')
  , (8, 12, null, 'mcq', 'D')
  , (8, 13, null, 'mcq', 'D')
  , (8, 14, null, 'mcq', 'B')
  , (8, 15, null, 'mcq', 'A')
  , (8, 16, null, 'mcq', 'A')
  , (8, 17, null, 'mcq', 'A')
  , (8, 18, 'a', 'boolean', '1')
  , (8, 18, 'b', 'boolean', '0')
  , (8, 18, 'c', 'boolean', '0')
  , (8, 18, 'd', 'boolean', '0')
  , (8, 19, 'a', 'boolean', '1')
  , (8, 19, 'b', 'boolean', '1')
  , (8, 19, 'c', 'boolean', '1')
  , (8, 19, 'd', 'boolean', '0')
  , (8, 20, 'a', 'boolean', '1')
  , (8, 20, 'b', 'boolean', '1')
  , (8, 20, 'c', 'boolean', '1')
  , (8, 20, 'd', 'boolean', '0')
  , (8, 21, 'a', 'boolean', '1')
  , (8, 21, 'b', 'boolean', '1')
  , (8, 21, 'c', 'boolean', '0')
  , (8, 21, 'd', 'boolean', '0')
  , (8, 23, null, 'numeric', '48')
  , (8, 24, null, 'numeric', '37')
  , (8, 25, null, 'numeric', '66.6')
  , (9, 1, null, 'mcq', 'B')
  , (9, 2, null, 'mcq', 'B')
  , (9, 3, null, 'mcq', 'A')
  , (9, 4, null, 'mcq', 'B')
  , (9, 5, null, 'mcq', 'C')
  , (9, 6, null, 'mcq', 'B')
  , (9, 7, null, 'mcq', 'C')
  , (9, 8, null, 'mcq', 'B')
  , (9, 9, null, 'mcq', 'C')
  , (9, 10, null, 'mcq', 'B')
  , (9, 11, null, 'mcq', 'A')
  , (9, 12, null, 'mcq', 'D')
  , (9, 13, null, 'mcq', 'D')
  , (9, 14, null, 'mcq', 'B')
  , (9, 15, null, 'mcq', 'A')
  , (9, 16, null, 'mcq', 'A')
  , (9, 17, null, 'mcq', 'A')
  , (9, 18, 'a', 'boolean', '1')
  , (9, 18, 'b', 'boolean', '0')
  , (9, 18, 'c', 'boolean', '0')
  , (9, 18, 'd', 'boolean', '0')
  , (9, 19, 'a', 'boolean', '1')
  , (9, 19, 'b', 'boolean', '1')
  , (9, 19, 'c', 'boolean', '1')
  , (9, 19, 'd', 'boolean', '0')
  , (9, 20, 'a', 'boolean', '1')
  , (9, 20, 'b', 'boolean', '1')
  , (9, 20, 'c', 'boolean', '1')
  , (9, 20, 'd', 'boolean', '0')
  , (9, 21, 'a', 'boolean', '1')
  , (9, 21, 'b', 'boolean', '1')
  , (9, 21, 'c', 'boolean', '0')
  , (9, 21, 'd', 'boolean', '0')
  , (9, 22, null, 'numeric', '48')
  , (9, 23, null, 'numeric', '37')
  , (9, 24, null, 'numeric', '66.6');
