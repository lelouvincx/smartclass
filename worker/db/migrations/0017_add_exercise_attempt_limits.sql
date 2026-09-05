alter table exercises add column max_attempts integer default 1
  check (max_attempts is null or max_attempts > 0);

alter table submissions add column attempt_number integer
  check (attempt_number is null or attempt_number > 0);

with ranked as (
  select
    id
    , row_number() over (
        partition by user_id, exercise_id
        order by coalesce(started_at, created_at), created_at, id
      ) as attempt_number
  from submissions
  where user_id is not null
)
update submissions
set attempt_number = (
  select ranked.attempt_number
  from ranked
  where ranked.id = submissions.id
)
where user_id is not null;

create unique index idx_submissions_user_exercise_attempt
  on submissions(user_id, exercise_id, attempt_number)
  where user_id is not null;

-- Keep inserts from the previous Worker compatible while the feature deploys.
create trigger submissions_assign_attempt_number_compat
after insert on submissions
for each row
when new.user_id is not null and new.attempt_number is null
begin
  update submissions
  set attempt_number = (
    select coalesce(max(existing.attempt_number), 0) + 1
    from submissions existing
    where existing.user_id = new.user_id
      and existing.exercise_id = new.exercise_id
      and existing.id <> new.id
  )
  where id = new.id;
end;
