-- Preserve source-facing section and local numbering separately from the
-- globally ordered q_id used by grading and navigation.

alter table answer_schemas add column section_key text not null default 'main';
alter table answer_schemas add column section_title text;
alter table answer_schemas add column local_number integer not null default 1 check (local_number > 0);

update answer_schemas set local_number = q_id;

create unique index idx_answer_schemas_source_identity
  on answer_schemas(exercise_id, section_key, local_number, coalesce(sub_id, ''));

alter table exercise_question_answer_schemas add column section_key text not null default 'main';
alter table exercise_question_answer_schemas add column section_title text;
alter table exercise_question_answer_schemas add column local_number integer not null default 1 check (local_number > 0);

update exercise_question_answer_schemas set local_number = q_id;

create unique index idx_exercise_question_answer_schemas_source_identity
  on exercise_question_answer_schemas(asset_set_id, section_key, local_number, coalesce(sub_id, ''));
