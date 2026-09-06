alter table answer_schemas
  add column max_score_hundredths integer
  check (max_score_hundredths is null or max_score_hundredths between 1 and 1000);

alter table exercise_question_answer_schemas
  add column max_score_hundredths integer
  check (max_score_hundredths is null or max_score_hundredths between 1 and 1000);
