-- RFC-11: immutable, teacher-confirmed question views derived from an exercise PDF.

create table exercise_question_asset_sets (
  id integer primary key autoincrement
  , exercise_id integer not null
  , source_file_id integer not null
  , detector_version text not null
  , detection_method text not null check (detection_method in ('text', 'vision', 'manual', 'mixed'))
  , confirmed_by integer
  , confirmed_at text
  , created_at text not null default current_timestamp
  , check (
      (confirmed_by is null and confirmed_at is null)
      or (confirmed_by is not null and confirmed_at is not null)
    )
  , foreign key (exercise_id) references exercises(id) on delete cascade
  , foreign key (source_file_id) references exercise_files(id) on delete cascade
  , foreign key (confirmed_by) references users(id)
);

create index idx_exercise_question_asset_sets_exercise
  on exercise_question_asset_sets(exercise_id);

create table exercise_question_assets (
  id integer primary key autoincrement
  , asset_set_id integer not null
  , q_id integer not null check (q_id > 0)
  , segment_index integer not null check (segment_index >= 0)
  , source_kind text not null check (source_kind in ('pdf_crop', 'teacher_screenshot'))
  , source_page integer
  , x real
  , y real
  , width real
  , height real
  , r2_key text not null unique
  , mime_type text not null check (mime_type in ('image/webp', 'image/png', 'image/jpeg'))
  , file_size integer not null check (file_size > 0)
  , pixel_width integer not null check (pixel_width > 0)
  , pixel_height integer not null check (pixel_height > 0)
  , accessible_text text
  , confidence real
  , rejected_by integer
  , rejected_at text
  , created_at text not null default current_timestamp
  , check (
      (
        source_kind = 'pdf_crop'
        and source_page > 0
        and x >= 0 and y >= 0
        and width > 0 and height > 0
        and x + width <= 1
        and y + height <= 1
        and confidence between 0 and 1
      )
      or (
        source_kind = 'teacher_screenshot'
        and source_page is null
        and x is null and y is null
        and width is null and height is null
        and confidence is null
      )
    )
  , check (
      (rejected_by is null and rejected_at is null)
      or (rejected_by is not null and rejected_at is not null)
    )
  , unique (asset_set_id, q_id, segment_index)
  , foreign key (asset_set_id) references exercise_question_asset_sets(id) on delete cascade
  , foreign key (rejected_by) references users(id)
);

create index idx_exercise_question_assets_set_question
  on exercise_question_assets(asset_set_id, q_id, segment_index);

create table exercise_question_answer_schemas (
  id integer primary key autoincrement
  , asset_set_id integer not null
  , q_id integer not null check (q_id > 0)
  , sub_id text
  , type text not null check (type in ('mcq', 'boolean', 'numeric'))
  , correct_answer text not null
  , created_at text not null default current_timestamp
  , foreign key (asset_set_id) references exercise_question_asset_sets(id) on delete cascade
);

create unique index idx_exercise_question_answer_schemas_set_key
  on exercise_question_answer_schemas(asset_set_id, q_id, coalesce(sub_id, ''));

alter table exercises add column active_question_asset_set_id integer
  references exercise_question_asset_sets(id);

alter table submissions add column question_asset_set_id integer
  references exercise_question_asset_sets(id);
