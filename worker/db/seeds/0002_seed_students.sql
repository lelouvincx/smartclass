pragma foreign_keys = on;

insert into users (phone, password_hash, role, status)
values
  ('+84900000001', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
  , ('+84900000002', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
  , ('+84900000003', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'pending')
  , ('+84900000004', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'disabled')
on conflict(phone) do update set
  password_hash = excluded.password_hash
  , role = 'student'
  , status = excluded.status
  , updated_at = current_timestamp;
