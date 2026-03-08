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
npm run build     # Production build
npm run preview   # Preview production build
```

## Project Structure

```
smartclass/
├── src/                    # Frontend (React)
│   ├── main.jsx            # App entry
│   ├── App.jsx             # Root component + demo UI
│   ├── pages/              # Route pages (planned)
│   ├── components/         # Shared UI primitives (planned)
│   └── lib/                # API client, auth, OCR utils (planned)
├── worker/                 # Backend API (planned)
│   ├── index.js            # Hono app entry
│   ├── routes/             # Route handlers
│   ├── middleware/          # JWT auth
│   └── db/                 # D1 migrations
├── docs/                   # Documentation
│   └── plans/              # Design docs
├── wrangler.toml           # Cloudflare config (planned)
└── package.json
```

## TODO

- [ ] **Project setup**: add React Router, Hono, wrangler.toml, D1/R2 bindings
- [ ] **Auth**: login/register pages, JWT middleware, phone+password auth
- [ ] **Database**: D1 schema migrations (users, exercises, answer_schemas, submissions, lectures)
- [ ] **Teacher dashboard**: exercise CRUD, PDF upload to R2, answer schema builder
- [ ] **Student dashboard**: exercise list, past submissions view
- [ ] **Exercise engine**: timed/untimed mode, manual form input, auto-grading
- [ ] **Scanner mode**: Tesseract.js OCR integration for answer sheet capture
- [ ] **Image upload**: upload answer sheet photo, extract answers client-side
- [ ] **Lectures**: YouTube video management, section/chapter editor (teacher), video browser (student)
- [ ] **Guest mode**: IndexedDB local storage, limited access without login
- [ ] **Student management**: teacher creates accounts (default pw `123`), approve pending registrations
- [ ] **Review & solutions**: students review graded submissions with correct answers
- [ ] **Deploy**: Cloudflare Pages (frontend) + Workers (API) deployment pipeline
