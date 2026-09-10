create table workspaces (
  id text primary key not null
  , slug text not null unique
  , display_name text not null
  , subject_code text not null unique
  , created_at text not null default current_timestamp
);

insert into workspaces (id, slug, display_name, subject_code) values
  ('maths', 'maths', 'Toán Thầy Thành', 'maths')
  , ('english', 'english', 'Tiếng Anh Cô Thuỳ', 'english');

create index idx_workspaces_display_name
  on workspaces(display_name, id);

alter table users add column platform_role text not null default 'user'
  check (platform_role in ('user', 'platform_admin'));

alter table users add column disabled_at text;

create table workspace_memberships (
  id integer primary key autoincrement
  , workspace_id text not null
  , user_id integer not null
  , role text not null check (role in ('teacher', 'student'))
  , status text not null default 'pending' check (status in ('pending', 'active', 'disabled'))
  , access_tier text not null default 'standard' check (access_tier in ('standard', 'vip'))
  , display_name text
  , created_at text not null default current_timestamp
  , updated_at text not null default current_timestamp
  , unique (workspace_id, user_id)
  , foreign key (workspace_id) references workspaces(id)
  , foreign key (user_id) references users(id)
);

create index idx_workspace_memberships_workspace_role_status
  on workspace_memberships(workspace_id, role, status, user_id);

create index idx_workspace_memberships_user_status
  on workspace_memberships(user_id, status, workspace_id);

create index idx_workspace_memberships_workspace_status_tier
  on workspace_memberships(workspace_id, status, access_tier, user_id);

create table workspace_membership_grades (
  membership_id integer not null
  , grade integer not null check (grade in (10, 11, 12, 'dgnl'))
  , primary key (membership_id, grade)
  , foreign key (membership_id) references workspace_memberships(id) on delete cascade
);

create index idx_workspace_membership_grades_grade_membership
  on workspace_membership_grades(grade, membership_id);

alter table exercises add column workspace_id text
  references workspaces(id);

alter table lectures add column workspace_id text
  references workspaces(id);

create index idx_exercises_workspace_created
  on exercises(workspace_id, created_at, id);

create index idx_lectures_workspace_order
  on lectures(workspace_id, order_index, id);

create index idx_lectures_workspace_visibility
  on lectures(workspace_id, is_visible, minimum_access_tier, order_index, id);
