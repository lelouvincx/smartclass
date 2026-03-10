# SmartClass

An assessment platform for teaching and learning, built on the Cloudflare free tier.

![](./docs/architecture.svg)

## Features

- **Teacher (admin)**: upload exercises (PDF) with answer schemas, manage lectures, create/approve student accounts
- **Student**: take timed or untimed exercises, submit answers (manual form, scanner/OCR, image upload), get auto-graded, review past results, watch lecture videos
- **Guest**: browse exercises and lectures, submit exercises with results saved locally — no login required

## Tech Stack

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Frontend | React 19, Vite 6, Tailwind CSS 3, React Router |
| Backend  | Cloudflare Workers + Hono                      |
| Database | Cloudflare D1 (SQLite)                         |
| Storage  | Cloudflare R2 (PDFs, images)                   |
| OCR      | Tesseract.js (client-side)                     |
| Auth     | Phone (+84xxx) + password, JWT                 |

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
```

Cloudflare resources can be created from CLI:

```bash
npx wrangler login
npx wrangler d1 create smartclass
npx wrangler r2 bucket create smartclass-assets
npx wrangler secret put JWT_SECRET
```

After creating resources, update `wrangler.toml` with your real D1 `database_id`.

### D1 Migrations

```bash
npx wrangler d1 execute smartclass --local --file worker/db/migrations/0001_init.sql
npx wrangler d1 execute smartclass --remote --file worker/db/migrations/0001_init.sql
```

If your database name is not `smartclass`, replace it in the commands above.

### Bootstrap Teacher Seed

Run the one-time teacher seed locally:

```bash
npx wrangler d1 execute smartclass --local --file worker/db/seeds/0001_seed_teacher.sql
```

Run the same seed on remote D1:

```bash
npx wrangler d1 execute smartclass --remote --file worker/db/seeds/0001_seed_teacher.sql
```

This seed upserts the bootstrap teacher account configured for v0.1.

## Project Structure

```
smartclass/
├── src/                    # Frontend (React)
│   ├── main.jsx            # App entry
│   ├── App.jsx             # Root component + demo UI
│   ├── pages/              # Route pages (planned)
│   ├── components/         # Shared UI primitives (planned)
│   └── lib/                # API client, auth, OCR utils (planned)
├── worker/                 # Backend API
│   ├── index.js            # Hono app entry
│   ├── routes/             # Route handlers
│   ├── middleware/          # JWT auth
│   └── db/                 # D1 migrations
├── docs/                   # Documentation
│   └── plans/              # Design docs
├── wrangler.toml           # Cloudflare worker config
└── package.json
```

## Roadmap

Each milestone produces a usable, deployable version.

### v0.1 — Deployable skeleton

- [x] Project setup: wrangler.toml, D1/R2 bindings, Hono worker entry
- [x] D1 schema migrations (users, exercises, answer_schemas, submissions, lectures)
- [x] Auth: phone+password login/register, JWT middleware, teacher creates students (pw `123`), pending approval flow
- [x] React Router, login/register pages
- [ ] Deploy: Cloudflare Pages + Workers pipeline

> **Ship:** users can register, log in, and see an empty dashboard.

### v0.2 — Core exercise flow

- [ ] Teacher: create exercises with answer schema (manual form builder)
- [ ] Student: browse exercise list, take exercises (manual form input, timed/untimed mode)
- [ ] Auto-grading: compare answers against schema, return score
- [ ] Submission history: student views past submissions with scores

> **Ship:** teachers create exercises, students complete and get graded — the core loop works.

### v0.3 — PDF & review

- [ ] Teacher: upload exercise PDFs to R2
- [ ] Student: view PDF in split-pane during exercise
- [ ] Review mode: student reviews graded submissions with correct answers shown

> **Ship:** exercises feel complete with real documents and solution review.

### v0.4 — Scanner & image upload

- [ ] Tesseract.js OCR integration (client-side)
- [ ] Scanner mode: camera capture → extract answers from standardized sheets
- [ ] Image upload mode: upload photo → OCR → populate answer form

> **Ship:** students can submit via three input methods (form, scanner, image).

### v0.5 — Lectures

- [ ] Teacher: add/edit/reorder YouTube lectures with named sections (chapters, solutions)
- [ ] Student: browse and watch lecture videos

> **Ship:** full learning experience with exercises + video lectures.

### v0.6 — Guest mode & polish

- [ ] Guest access: no login, browse exercises/lectures, submit with results saved in IndexedDB
- [ ] Prompt guest to register after engagement
- [ ] UI polish and mobile responsiveness

> **Ship:** anonymous users can try the platform — ready for marketing.
