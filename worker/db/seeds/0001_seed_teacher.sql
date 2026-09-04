PRAGMA foreign_keys = ON;

INSERT INTO users (phone, name, password_hash, role, status)
VALUES ('+84865481769', 'Demo Teacher', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'teacher', 'active')
ON CONFLICT(phone) DO UPDATE SET
  password_hash = excluded.password_hash,
  name = excluded.name,
  role = 'teacher',
  status = 'active',
  updated_at = CURRENT_TIMESTAMP;
