create table exercise_question_answer_assets (
  id integer primary key autoincrement
  , asset_set_id integer not null
  , q_id integer not null check (q_id > 0)
  , segment_index integer not null check (segment_index >= 0)
  , r2_key text not null unique
  , mime_type text not null check (mime_type in ('image/webp', 'image/png', 'image/jpeg'))
  , file_size integer not null check (file_size > 0)
  , pixel_width integer not null check (pixel_width > 0)
  , pixel_height integer not null check (pixel_height > 0)
  , created_at text not null default current_timestamp
  , unique (asset_set_id, q_id, segment_index)
  , foreign key (asset_set_id) references exercise_question_asset_sets(id) on delete cascade
);

create index idx_exercise_question_answer_assets_set_question
  on exercise_question_answer_assets(asset_set_id, q_id, segment_index);