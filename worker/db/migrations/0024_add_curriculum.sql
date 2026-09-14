alter table workspaces add column curriculum_revision integer not null default 0
  check (typeof(curriculum_revision) = 'integer' and curriculum_revision >= 0);

create unique index idx_lectures_id_workspace_unique
  on lectures(id, workspace_id);

create table curriculum_topics (
  id integer primary key autoincrement
  , workspace_id text not null
  , programme integer not null check (programme in (10, 11, 12, 'thpt', 'dgnl'))
  , title text not null check (length(trim(title)) > 0)
  , order_index integer not null default 0 check (typeof(order_index) = 'integer' and order_index >= 0)
  , check (id > 0)
  , unique (id, workspace_id)
  , foreign key (workspace_id) references workspaces(id)
);

create index idx_curriculum_topics_workspace_programme_order
  on curriculum_topics(workspace_id, programme, order_index, id);

create table curriculum_lessons (
  id integer primary key autoincrement
  , workspace_id text not null
  , topic_id integer not null
  , title text not null check (length(trim(title)) > 0)
  , order_index integer not null default 0 check (typeof(order_index) = 'integer' and order_index >= 0)
  , check (id > 0)
  , unique (id, workspace_id)
  , foreign key (workspace_id) references workspaces(id)
  , foreign key (topic_id, workspace_id) references curriculum_topics(id, workspace_id) on delete restrict
);

create index idx_curriculum_lessons_topic_order
  on curriculum_lessons(workspace_id, topic_id, order_index, id);

create table lecture_placements (
  id integer primary key autoincrement
  , workspace_id text not null
  , lesson_id integer not null
  , lecture_id integer not null
  , order_index integer not null default 0 check (typeof(order_index) = 'integer' and order_index >= 0)
  , check (id > 0)
  , unique (id, workspace_id)
  , unique (lesson_id, lecture_id)
  , foreign key (workspace_id) references workspaces(id)
  , foreign key (lesson_id, workspace_id) references curriculum_lessons(id, workspace_id) on delete restrict
  , foreign key (lecture_id, workspace_id) references lectures(id, workspace_id) on delete cascade
);

create index idx_lecture_placements_lesson_order
  on lecture_placements(workspace_id, lesson_id, order_index, id);

create index idx_lecture_placements_lecture
  on lecture_placements(workspace_id, lecture_id, lesson_id, id);
