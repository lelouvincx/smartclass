pragma foreign_keys = on;

insert into users (phone, name, password_hash, role, status)
values
  ('+84900000001', 'Active Student One', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
  , ('+84900000002', 'Active Student Two', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
  , ('+84900000003', 'Pending Student', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'pending')
  , ('+84900000004', 'Disabled Student', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'disabled')
on conflict(phone) do update set
  password_hash = excluded.password_hash
  , name = excluded.name
  , role = 'student'
  , status = excluded.status
  , updated_at = current_timestamp;

insert or ignore into student_grades (user_id, grade)
select users.id, grades.grade
from users
cross join (
  select 10 as grade
  union all select 11
  union all select 12
) as grades
where users.phone in (
  '+84900000001'
  , '+84900000002'
);
