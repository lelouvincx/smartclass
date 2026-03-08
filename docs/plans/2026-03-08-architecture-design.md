# SmartClass Architecture Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

SmartClass is an assessment platform with three roles (Teacher, Student, Guest). The current codebase is a demo-only React SPA. This document defines the production architecture: a full Cloudflare stack chosen for minimal cost and simplicity.

```
React SPA (Cloudflare Pages)
        ↕ REST API (JSON)
Cloudflare Workers (Hono)
        ↕
D1 (SQLite)  +  R2 (file storage)
```

## Stack

| Layer         | Technology              | Free Tier                |
| ------------- | ----------------------- | ------------------------ |
| Frontend      | React 19 + Vite 6       | Cloudflare Pages (free)  |
| Backend API   | Cloudflare Workers + Hono | 100K req/day           |
| Database      | Cloudflare D1 (SQLite)  | 5M reads/day, 100K writes/day |
| File storage  | Cloudflare R2            | 10GB storage            |
| OCR           | Tesseract.js (client-side) | Free (runs in browser) |
| Videos        | YouTube embeds           | Free                    |

## Frontend

### Tech
- React 19, Vite 6, Tailwind CSS 3, lucide-react icons.
- Add **React Router** for page navigation.
- Existing inline shadcn-style primitives (Button, Card, Table, etc.) remain.

### Pages
- `/` — Landing / login page
- `/register` — Student self-registration
- `/teacher` — Teacher dashboard (manage exercises, lectures, students)
- `/teacher/exercises/new` — Assignment builder
- `/teacher/lectures` — Lecture page editor
- `/teacher/students` — Student management (approve pending, create accounts)
- `/student` — Student dashboard (exercise list, past submissions)
- `/student/exercises/:id` — Exercise execution engine (timed/untimed)
- `/student/exercises/:id/review` — Review past submission + view solutions
- `/lectures` — Lecture browser (accessible to all roles)
- `/lectures/:id` — Lecture video player

### Guest Behavior
- No login required. Guest can browse exercises, lectures, and submit some exercises.
- Guest work is saved in **IndexedDB** (client-only, never sent to server).
- Prompts to register when hitting limitations.

### OCR (Client-Side)
- Tesseract.js runs in the browser when student uses scanner mode or uploads an image.
- Extracts answers from standardized multiple-choice sheets (gridded bubbles).
- Extracted answers populate the form; student reviews and submits.
- No server-side OCR needed — keeps Workers within 10ms CPU free tier.

## Backend

### Framework
- **Hono** — lightweight, Cloudflare-native router (~14KB). Provides middleware, routing, and context helpers.

### Auth
- **Username**: Vietnam phone number (`+84xxxxxxxxx`).
- **Password**: hashed with `bcryptjs` (works in Workers runtime).
- **JWT** stored in `localStorage`, sent as `Authorization: Bearer <token>` header.
- Two registration flows:
  1. **Teacher creates student** — default password `123`, status `active`.
  2. **Student self-registers** — status `pending`, teacher approves via dashboard.
- Guest routes require no token. Protected routes use a JWT middleware.

### API Endpoints

#### Auth
```
POST /api/auth/login          { phone, password } → { token, user }
POST /api/auth/register       { phone, password, name } → { message } (status: pending)
```

#### Users (Teacher only)
```
GET    /api/users              → list students (with status filter)
POST   /api/users              { phone, name } → create student (pw: 123)
PUT    /api/users/:id/approve  → approve pending student
PUT    /api/users/:id/password → student changes own password
```

#### Exercises
```
GET    /api/exercises              → list exercises
GET    /api/exercises/:id          → exercise detail + schema
POST   /api/exercises              { title, duration, timed, schema[] } + PDF upload
PUT    /api/exercises/:id          → update exercise
DELETE /api/exercises/:id          → delete exercise
```

#### Submissions (Student only)
```
POST   /api/exercises/:id/submit   { answers[] } → { score, results[] }
GET    /api/submissions            → list own past submissions
GET    /api/submissions/:id        → submission detail (answers + correct answers)
```

#### Lectures
```
GET    /api/lectures               → list lectures (grouped by section)
POST   /api/lectures               { title, section, youtube_url, sort_order }
PUT    /api/lectures/:id           → update lecture (rename section, reorder)
DELETE /api/lectures/:id           → delete lecture
```

### Grading Logic
- On submission, Worker fetches the exercise's answer schema from D1.
- Simple loop: compare each `submitted_answer` against `correct_answer`.
- Score = count of correct answers / total questions.
- Returns per-question results (correct/incorrect + correct answer for review).

## Database (D1 — SQLite)

### Schema

```sql
create table users (
    id integer primary key autoincrement
    , phone text unique not null
    , password_hash text not null
    , name text not null
    , role text not null default 'student' -- 'teacher' | 'student'
    , status text not null default 'active' -- 'active' | 'pending'
    , created_at text not null default (datetime('now'))
);

create table exercises (
    id integer primary key autoincrement
    , title text not null
    , duration_minutes integer not null
    , timed_mode integer not null default 1 -- 1 = timed, 0 = untimed
    , pdf_r2_key text -- R2 object key for the PDF
    , created_by integer not null references users(id)
    , created_at text not null default (datetime('now'))
);

create table answer_schemas (
    id integer primary key autoincrement
    , exercise_id integer not null references exercises(id) on delete cascade
    , question_number integer not null
    , question_type text not null -- 'mcq' | 'boolean' | 'numeric'
    , correct_answer text not null
    , unique(exercise_id, question_number)
);

create table submissions (
    id integer primary key autoincrement
    , user_id integer not null references users(id)
    , exercise_id integer not null references exercises(id)
    , score real -- percentage 0.0 to 1.0
    , submitted_at text not null default (datetime('now'))
);

create table submission_answers (
    id integer primary key autoincrement
    , submission_id integer not null references submissions(id) on delete cascade
    , question_number integer not null
    , submitted_answer text
    , is_correct integer -- 1 or 0
);

create table lectures (
    id integer primary key autoincrement
    , section_name text not null -- e.g. 'Chapter 1', 'Solution for Exercise 3'
    , title text not null
    , youtube_url text not null
    , sort_order integer not null default 0
    , created_by integer not null references users(id)
    , created_at text not null default (datetime('now'))
);
```

## File Storage (R2)

- **Bucket**: `smartclass-files`
- **Objects**: exercise PDFs, student-uploaded answer sheet images.
- **Upload flow**: Worker generates a presigned URL → client uploads directly to R2 → Worker stores the R2 key in D1.

## Project Structure

```
smartclass/
├── src/                    # Frontend (React)
│   ├── main.jsx
│   ├── App.jsx
│   ├── pages/              # Route pages
│   ├── components/         # Shared UI primitives
│   └── lib/                # API client, auth helpers, OCR utils
├── worker/                 # Backend (Cloudflare Worker)
│   ├── index.js            # Hono app entry
│   ├── routes/             # Route handlers (auth, exercises, etc.)
│   ├── middleware/          # JWT auth middleware
│   └── db/                 # D1 schema migrations
├── wrangler.toml           # Cloudflare Worker config (D1, R2 bindings)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Deployment

- `npx wrangler pages deploy dist/` — deploy frontend
- `npx wrangler deploy worker/index.js` — deploy API worker
- `npx wrangler d1 migrations apply smartclass-db` — run DB migrations
- All managed via single `wrangler.toml`.
