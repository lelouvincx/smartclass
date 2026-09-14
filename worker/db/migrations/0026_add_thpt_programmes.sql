create table workspace_membership_grades_with_thpt (
  membership_id integer not null
  , grade integer not null check (grade in (10, 11, 12, 'thpt', 'dgnl'))
  , primary key (membership_id, grade)
  , foreign key (membership_id) references workspace_memberships(id) on delete cascade
);

insert into workspace_membership_grades_with_thpt (membership_id, grade)
select membership_id, grade from workspace_membership_grades;

drop table workspace_membership_grades;
alter table workspace_membership_grades_with_thpt rename to workspace_membership_grades;

create index idx_workspace_membership_grades_grade_membership
  on workspace_membership_grades(grade, membership_id);

create table exercise_grades_with_thpt (
  exercise_id integer not null
  , grade integer not null check (grade in (10, 11, 12, 'thpt', 'dgnl'))
  , primary key (exercise_id, grade)
  , foreign key (exercise_id) references exercises(id) on delete cascade
);

insert into exercise_grades_with_thpt (exercise_id, grade)
select exercise_id, grade from exercise_grades;

drop table exercise_grades;
alter table exercise_grades_with_thpt rename to exercise_grades;

create index idx_exercise_grades_grade_exercise
  on exercise_grades(grade, exercise_id);
