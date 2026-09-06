pragma defer_foreign_keys = on;

drop index idx_exercise_question_answer_candidates_set_key_source;
drop index idx_exercise_question_answer_candidates_set;

alter table exercise_question_answer_candidates rename to exercise_question_answer_candidates_old;

create table exercise_question_answer_candidates (
  id integer primary key autoincrement
  , asset_set_id integer not null
  , q_id integer not null check (q_id > 0)
  , sub_id text
  , type text not null check (type in ('mcq', 'boolean', 'numeric'))
  , proposed_answer text not null
  , source_kind text not null check (
      source_kind in ('answer_pdf_text', 'answer_pdf_green_highlight')
    )
  , source_file_id integer not null
  , extractor_version text
  , model_id text
  , source_page integer
  , source_x real
  , source_y real
  , source_width real
  , source_height real
  , confidence real
  , created_at text not null default current_timestamp
  , check (
      confidence between 0 and 1
      or (source_kind = 'answer_pdf_text' and confidence is null)
    )
  , check (
      source_kind = 'answer_pdf_text'
      or (
        source_kind = 'answer_pdf_green_highlight'
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

insert into exercise_question_answer_candidates (
  id, asset_set_id, q_id, sub_id, type, proposed_answer, source_kind,
  source_file_id, extractor_version, model_id, source_page, source_x,
  source_y, source_width, source_height, confidence, created_at
)
select
  id, asset_set_id, q_id, sub_id, type, proposed_answer, source_kind,
  source_file_id, extractor_version, model_id, source_page, source_x,
  source_y, source_width, source_height, confidence, created_at
from exercise_question_answer_candidates_old;

drop table exercise_question_answer_candidates_old;

create unique index idx_exercise_question_answer_candidates_set_key_source
  on exercise_question_answer_candidates(
    asset_set_id, q_id, coalesce(sub_id, ''), source_kind
  );

create index idx_exercise_question_answer_candidates_set
  on exercise_question_answer_candidates(asset_set_id, q_id, sub_id);
