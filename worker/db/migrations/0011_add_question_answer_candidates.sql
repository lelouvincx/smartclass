-- RFC-11: teacher-reviewed answer candidates from the Answer PDF and exercise highlights.

alter table exercise_question_asset_sets add column answer_source_file_id integer
  references exercise_files(id);

alter table exercise_question_asset_sets add column answer_parser_status text not null
  default 'not_provided'
  check (answer_parser_status in ('not_provided', 'parsed', 'failed'));

create table exercise_question_answer_candidates (
  id integer primary key autoincrement
  , asset_set_id integer not null
  , q_id integer not null check (q_id > 0)
  , sub_id text
  , type text not null check (type in ('mcq', 'boolean', 'numeric'))
  , proposed_answer text not null
  , source_kind text not null check (
      source_kind in ('answer_pdf_text', 'exercise_green_highlight')
    )
  , source_file_id integer not null
  , extractor_version text
  , model_id text
  , source_page integer
  , source_x real
  , source_y real
  , source_width real
  , source_height real
  , confidence real not null check (confidence between 0 and 1)
  , created_at text not null default current_timestamp
  , check (
      source_kind = 'answer_pdf_text'
      or (
        source_kind = 'exercise_green_highlight'
        and source_page > 0
        and source_x >= 0 and source_y >= 0
        and source_width > 0 and source_height > 0
        and source_x + source_width <= 1
        and source_y + source_height <= 1
      )
    )
  , foreign key (asset_set_id) references exercise_question_asset_sets(id) on delete cascade
  , foreign key (source_file_id) references exercise_files(id)
);

create unique index idx_exercise_question_answer_candidates_set_key_source
  on exercise_question_answer_candidates(
    asset_set_id
    , q_id
    , coalesce(sub_id, '')
    , source_kind
  );

create index idx_exercise_question_answer_candidates_set
  on exercise_question_answer_candidates(asset_set_id, q_id, sub_id);
