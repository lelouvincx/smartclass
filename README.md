# SmartClass

An assessment platform for teaching and learning, built on Cloudflare.

![](./docs/architecture.svg)

## Features

- **Teacher (admin)**: upload exercises (PDF) with answer schemas, manage lectures, create/approve student accounts
- **Student**: take timed or untimed exercises, submit answers (manual form, scanner/OCR, image upload), get auto-graded, review past results, watch lecture videos
- **Guest**: browse exercises and lectures, submit exercises with results saved locally — no login required

## Roadmap

Each milestone produces a usable, deployable version.

### v0.1 — Deployable skeleton

- [x] Project setup: wrangler.toml, D1/R2 bindings, Hono worker entry
- [x] D1 schema migrations (users, exercises, answer_schemas, submissions, lectures)
- [x] Auth: phone+password login/register, JWT middleware, teacher creates students (pw `123`), pending approval flow
- [x] React Router, login/register pages
- [x] Deploy: Cloudflare Pages + Workers pipeline

> **Ship:** users can register, log in, and see an empty dashboard.

Status: done.

### v0.2 — Core exercise flow

- [x] Backend test infrastructure ([#9](https://github.com/lelouvicnx/smartclass/pull/9))
- [x] Exercise CRUD API with answer schema support ([#10](https://github.com/lelouvincx/smartclass/pull/10))
- [x] Teacher file upload via R2 presigned URLs ([#10](https://github.com/lelouvincx/smartclass/pull/10))
- [x] v0.2.1 Teacher: create exercises with answer schema (frontend) ([#11](https://github.com/lelouvincx/smartclass/pull/11))
- [x] Student: browse exercise list (frontend) ([#13](https://github.com/lelouvincx/smartclass/pull/13))
- [x] Student: take exercises (manual form input) ([#17](https://github.com/lelouvincx/smartclass/pull/17))
- [x] v0.2.2 Submission API: create, submit answers, retrieve ([#16](https://github.com/lelouvincx/smartclass/pull/16))
- [x] v0.2.3 Test version 0.2.1 with scanning PDF exercises and answer schema validation (manual form input for now) ([#20](https://github.com/lelouvincx/smartclass/pull/20), [#21](https://github.com/lelouvincx/smartclass/pull/21), [#22](https://github.com/lelouvincx/smartclass/pull/22), [#23](https://github.com/lelouvincx/smartclass/pull/23), [#24](https://github.com/lelouvincx/smartclass/pull/24))
- [ ] Update answer schema of boolean questions to include more sub-questions (one boolean question can have 4 sub-questions, each with its own correct answer, score, and explanation) => go with format "0101"
- [ ] Student/Teacher: view exercises
- [ ] Auto-grading: fill in is_correct and score after submission
- [ ] Submission history: student views past submissions

> **Ship:** teachers create exercises, students complete and get graded — the core loop works.

### v0.3 — student review

- [ ] Student: view PDF in split-pane during exercise
- [ ] Review mode: student reviews graded submissions with correct answers shown

> **Ship:** exercises feel complete with real documents and solution review.

### v0.4 — Scanner & image upload

- [ ] Tesseract.js OCR integration (client-side)
- [ ] Scanner mode: camera capture → extract answers from standardized sheets
- [ ] Image upload mode: upload photo → OCR → populate answer form

> **Ship:** students can submit via three input methods (form, scanner, image).

### v0.5 — Lectures

- [ ] Plan guest mode: design IndexedDB storage, guest route access, and data model for anonymous exercise completion (implementation in v0.6)
- [ ] Teacher: add/edit/reorder YouTube lectures with named sections (chapters, solutions)
- [ ] Student: browse and watch lecture videos

> **Ship:** full learning experience with exercises + video lectures.

### v0.6 — Guest mode & polish

- [ ] Guest access: no login, browse exercises/lectures, submit with results saved in IndexedDB
- [ ] Prompt guest to register after engagement
- [ ] UI polish and mobile responsiveness

> **Ship:** anonymous users can try the platform — ready for marketing.

## Tech Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Frontend | React 19, Vite 6, Tailwind CSS 3, React Router |
| Backend  | Cloudflare Workers + Hono                      |
| Database | Cloudflare D1 (SQLite)                         |
| Storage  | Cloudflare R2 (PDFs, images)                   |
| OCR      | Tesseract.js (client-side)                     |
| Auth     | Phone (+84xxx) + password, JWT                 |

## Project Structure

```
smartclass/
├── src/                    # Frontend (React)
│   ├── main.jsx            # App entry
│   ├── router.jsx          # Router entry
│   ├── pages/              # Route pages
│   ├── lib/                # API client + auth state
│   └── test/               # Test setup
├── worker/                 # Backend API
│   ├── index.js            # Hono app entry
│   ├── routes/             # Route handlers
│   ├── middleware/         # JWT auth
│   ├── lib/                # Auth helpers
│   └── db/                 # D1 migrations + seeds
├── .github/workflows/      # CI/CD workflows
├── docs/                   # Documentation
│   └── plans/              # Design docs
├── wrangler.toml           # Cloudflare worker config
└── package.json
```

## Getting Started

```bash
npm install
npm run dev       # Start dev server at localhost:5173
npm run dev:api   # Start Cloudflare Worker locally at localhost:8787
npm run build     # Production build
npm run preview   # Preview production build
```

### Environment Variables (`.envrc`)

```bash
export APP_ENV=development
export JWT_SECRET=replace-with-a-long-random-string
export JWT_EXPIRES_IN=7d
export CLOUDFLARE_ACCOUNT_ID=your_account_id
export CLOUDFLARE_D1_DATABASE_ID=your_d1_database_id
export CLOUDFLARE_D1_DATABASE_NAME=smartclass
export CLOUDFLARE_R2_BUCKET_NAME=smartclass-assets
export APP_CORS_ORIGIN=http://localhost:5173
export VITE_API_BASE_URL=http://localhost:8787
export OPENROUTER_API_KEY=your_openrouter_api_key
export OPENROUTER_MODEL=google/gemini-2.5-flash
```

For local Worker secrets during `wrangler dev`, create `.dev.vars`:

```bash
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=7d
OPENROUTER_API_KEY=your_openrouter_api_key
```

Cloudflare resources can be created from CLI:

```bash
npx wrangler login
npx wrangler d1 create smartclass
npx wrangler r2 bucket create smartclass-assets
npx wrangler secret put JWT_SECRET
```

After creating resources, update `wrangler.toml` with your real D1 `database_id`.

### Database Setup (D1)

```bash
# Apply schema
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0001_init.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0001_init.sql

# Seed bootstrap teacher
npx wrangler d1 execute smartclass --local --file worker/db/seeds/0001_seed_teacher.sql
npx wrangler d1 execute smartclass --remote --file worker/db/seeds/0001_seed_teacher.sql
```

If your database name is not `smartclass`, replace it in the commands above.

The teacher seed is idempotent and can be re-run safely.

### Deployment

Production domains:

- Frontend: `https://smartclass.lelouvincx.com`
- API: `https://api.smartclass.lelouvincx.com`

Setup summary:

1. Cloudflare Pages project `smartclass` via GitHub App:
   - Production branch `main`
   - Build command `npm run build`
   - Output directory `dist`
   - Env var `VITE_API_BASE_URL=https://api.smartclass.lelouvincx.com`
2. Worker route: `api.smartclass.lelouvincx.com`
3. GitHub repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `JWT_SECRET`

Repository automation:

- `.github/workflows/deploy-worker.yml`: deploys Worker on `main` after install/test/build
- Manual deploy commands:
  - `npm run deploy:api`
  - `npm run deploy:web`

#### Post-deploy smoke checks

```bash
curl -s https://api.smartclass.lelouvincx.com/api/health
```

Then verify browser login flow at `https://smartclass.lelouvincx.com`.

### GitHub Releases

Tags matching `v*` trigger `.github/workflows/release.yml`, which runs test/build checks and then creates a GitHub Release with autogenerated notes.

Create a new release tag:

```bash
git checkout main
git pull
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```
