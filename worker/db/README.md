# Database Migrations & Seeds

## Migrations

Apply migrations in order:

```bash
# Local
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0001_init.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0002_add_submission_answers.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0003_exercise_files.sql
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0004_fix_cascade_deletes.sql

# Remote
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0001_init.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0002_add_submission_answers.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0003_exercise_files.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0004_fix_cascade_deletes.sql
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
- `submissions` - Student submission records
- `submission_answers` - Individual answers per submission
- `lectures` - YouTube video lectures

### Relationships
- Exercise → Answer Schemas (one-to-many, cascade delete)
- Exercise → Exercise Files (one-to-many, cascade delete)
- Exercise → Submissions (one-to-many)
- Submission → Submission Answers (one-to-many, cascade delete)
