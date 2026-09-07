# Database Migrations & Seeds

## Migrations

Apply migrations in order:

```bash
# Local
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0001_init.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0002_add_submission_answers.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0003_exercise_files.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0004_fix_cascade_deletes.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0005_add_sub_id.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0006_add_cascade_submissions.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0007_add_submission_files.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0008_add_exercise_extract_model.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0009_add_google_link.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0010_add_exercise_question_assets.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0011_add_question_answer_candidates.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0012_reset_extract_model_to_deepseek.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0013_add_user_name.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0014_add_lecture_visibility.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0015_add_grade_access.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0016_add_question_section_identity.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0017_add_exercise_attempt_limits.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0017_cohere_answer_extraction.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0018_add_dgnl_access_class.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0019_add_access_tiers.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0020_add_score_allocation.sql

# Remote
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0001_init.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0002_add_submission_answers.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0003_exercise_files.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0004_fix_cascade_deletes.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0005_add_sub_id.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0006_add_cascade_submissions.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0007_add_submission_files.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0008_add_exercise_extract_model.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0009_add_google_link.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0010_add_exercise_question_assets.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0011_add_question_answer_candidates.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0012_reset_extract_model_to_deepseek.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0013_add_user_name.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0014_add_lecture_visibility.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0015_add_grade_access.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0016_add_question_section_identity.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0017_add_exercise_attempt_limits.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0017_cohere_answer_extraction.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0018_add_dgnl_access_class.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0019_add_access_tiers.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0020_add_score_allocation.sql
```

If your database name is different, replace `smartclass` with your D1 database name.

## Seeds

Bootstrap teacher, sample student accounts, and canonical exercises with answer schemas (idempotent):

```bash
# Local
npx wrangler d1 execute smartclass --local --file worker/db/seeds/0001_seed_teacher.sql
npx wrangler d1 execute smartclass --local --file worker/db/seeds/0002_seed_students.sql
npx wrangler d1 execute smartclass --local --file worker/db/seeds/0003_seed_exercises.sql

# Remote
npx wrangler d1 execute smartclass --remote --file worker/db/seeds/0001_seed_teacher.sql
npx wrangler d1 execute smartclass --remote --file worker/db/seeds/0002_seed_students.sql
npx wrangler d1 execute smartclass --remote --file worker/db/seeds/0003_seed_exercises.sql
```

The exercise seed excludes `exercise_files` rows because their R2 objects are not available in a fresh local environment.

Default teacher credentials:
- Phone: `+84865481769`
- Password: `123`

## Schema Overview

### Core Tables
- `users` - Teachers and students
- `exercises` - Exercise metadata
- `answer_schemas` - Correct answers (one row per question)
- `exercise_files` - Uploaded PDFs/images (one-to-many with exercises)
- `exercise_question_asset_sets` - Pending and teacher-confirmed question image generations
- `exercise_question_assets` - Ordered generated crops or teacher screenshots for one question
- `exercise_question_answer_schemas` - Immutable answer-schema snapshots pinned to question asset sets
- `exercise_question_answer_candidates` - Reviewable suggestions from Answer PDFs and green highlights
- `submissions` - Student submission records
- `submission_answers` - Individual answers per submission
- `lectures` - YouTube video lectures

### Relationships
- Exercise → Answer Schemas (one-to-many, cascade delete)
- Exercise → Exercise Files (one-to-many, cascade delete)
- Exercise → Question Asset Sets (one-to-many, cascade delete)
- Question Asset Set → Question Assets, Answer Candidates, and Answer Schema Snapshot (one-to-many, cascade delete)
- Exercise → Submissions (one-to-many)
- Submission → Submission Answers (one-to-many, cascade delete)
