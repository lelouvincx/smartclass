# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Let signed-in teachers securely change their own password from Settings after verifying their current password, with independently collapsible setting sections. [#87](https://github.com/lelouvincx/smartclass/pull/87)
- Add a dedicated, prioritized, and versioned todo list, link it from the README, and document the task lifecycle from planned work to completed change. [#82](https://github.com/lelouvincx/smartclass/pull/82)
- Add Google sign-in and account linking, including settings to link and unlink an account. [#68](https://github.com/lelouvincx/smartclass/pull/68) [#69](https://github.com/lelouvincx/smartclass/pull/69) [#70](https://github.com/lelouvincx/smartclass/pull/70)
- Add a changelog, move shipped-change history out of the README, and enforce changelog updates for every pull request. [#82](https://github.com/lelouvincx/smartclass/pull/82)
- Let teachers create student accounts and approve pending accounts. [#63](https://github.com/lelouvincx/smartclass/pull/63) [#64](https://github.com/lelouvincx/smartclass/pull/64)
- Let teachers add, edit, and reorder YouTube lectures with named sections. [#76](https://github.com/lelouvincx/smartclass/pull/76)
- Add the Google-format design system, semantic tokens, responsive app shell, and shared product compositions. [#75](https://github.com/lelouvincx/smartclass/pull/75)

### Changed

- Ignore the local `.amp` and `.impeccable` runtime directories. [#82](https://github.com/lelouvincx/smartclass/pull/82)
- Consolidate the take and review experience into a two-panel PDF and answer layout. [#66](https://github.com/lelouvincx/smartclass/pull/66)
- Show one selected question at a time on the take page, with Previous and Next controls. [#67](https://github.com/lelouvincx/smartclass/pull/67)

### Deprecated

### Removed

### Fixed

### Security

## [0.4.5] - 2026-05-11

### Added

- Add a pre-start exercise landing page and create submissions only when students select **Start**. [#56](https://github.com/lelouvincx/smartclass/pull/56)
- Add a persistent answer-sheet sidebar, question navigation grid, dynamic unanswered count, and a distinct skipped-answer state. [#57](https://github.com/lelouvincx/smartclass/pull/57)
- Add a submission summary page, per-question review navigation, multiple-choice deselection, and a submitted-exercise banner. [#58](https://github.com/lelouvincx/smartclass/pull/58)
- Add drag-and-drop teacher uploads and 150% interface zoom. [#59](https://github.com/lelouvincx/smartclass/pull/59)

### Changed

- Trim image extraction to Mistral Small 3.2 and Grok 4.1 Fast, with Mistral as the default and fallback model. [#59](https://github.com/lelouvincx/smartclass/pull/59)

## [0.4] - 2026-05-03

### Added

- Add image-answer extraction storage, authenticated submission extraction, and teacher-configurable model selection. [#52](https://github.com/lelouvincx/smartclass/pull/52) [#54](https://github.com/lelouvincx/smartclass/pull/54)
- Add schema-aware vision LLM extraction with validation, normalization, missing-row backfill, and Gemini retry fallback. [#53](https://github.com/lelouvincx/smartclass/pull/53)
- Add student photo uploads with progress, cancellation, retry, confidence indicators, and a Manual/Photo mode switch. [#54](https://github.com/lelouvincx/smartclass/pull/54)

### Changed

- Increase page margins for more readable teacher and student layouts. [#51](https://github.com/lelouvincx/smartclass/pull/51)

## [0.3] - 2026-03-16

### Added

- Add tiered file access for public exercise PDFs and teacher-only solution and reference files. [#42](https://github.com/lelouvincx/smartclass/pull/42)
- Add a split-pane PDF exercise experience with responsive collapse behavior. [#45](https://github.com/lelouvincx/smartclass/pull/45) [#49](https://github.com/lelouvincx/smartclass/pull/49)
- Add paginated and filtered submission history with cross-user isolation. [#43](https://github.com/lelouvincx/smartclass/pull/43)
- Add graded submission details with correct answers, exercise context, and files. [#44](https://github.com/lelouvincx/smartclass/pull/44)
- Add student submission history and detailed result review pages. [#46](https://github.com/lelouvincx/smartclass/pull/46) [#47](https://github.com/lelouvincx/smartclass/pull/47)
- Add submission history navigation and a dashboard quick action. [#48](https://github.com/lelouvincx/smartclass/pull/48)
- Add drag-and-drop reordering for teacher answer-schema rows. [#41](https://github.com/lelouvincx/smartclass/pull/41)

### Changed

- Let students hide the timer, show exercise-list refresh timestamps, group schema generation with its upload, add common duration choices and required-field markers, normalize local phone numbers, and use semantic correctness colors. [#40](https://github.com/lelouvincx/smartclass/pull/40)

## [0.2] - 2026-03-16

### Added

- Add backend test infrastructure. [#9](https://github.com/lelouvincx/smartclass/pull/9)
- Add exercise CRUD with answer schemas and teacher uploads through R2 presigned URLs. [#10](https://github.com/lelouvincx/smartclass/pull/10)
- Add teacher exercise creation and answer-schema editing. [#11](https://github.com/lelouvincx/smartclass/pull/11) [#30](https://github.com/lelouvincx/smartclass/pull/30)
- Add student exercise browsing and manual exercise-taking. [#13](https://github.com/lelouvincx/smartclass/pull/13) [#17](https://github.com/lelouvincx/smartclass/pull/17)
- Add submission creation, answer submission, and retrieval. [#16](https://github.com/lelouvincx/smartclass/pull/16)
- Add four independently graded sub-questions for true/false questions. [#28](https://github.com/lelouvincx/smartclass/pull/28)
- Add automatic grading and immediate scores and answer results. [#31](https://github.com/lelouvincx/smartclass/pull/31)
- Add automatic dbdocs schema updates in CI. [#29](https://github.com/lelouvincx/smartclass/pull/29)

### Fixed

- Fix non-ASCII upload headers and extraction provider fallbacks found while testing scanned PDF exercises. [#20](https://github.com/lelouvincx/smartclass/pull/20) [#21](https://github.com/lelouvincx/smartclass/pull/21) [#22](https://github.com/lelouvincx/smartclass/pull/22) [#23](https://github.com/lelouvincx/smartclass/pull/23) [#24](https://github.com/lelouvincx/smartclass/pull/24)
- Fix question ID validation, cascade deletes, atomic writes, and worker test configuration. [#35](https://github.com/lelouvincx/smartclass/pull/35)

## [0.1] - 2026-03-10

### Added

- Add the Cloudflare Worker foundation with D1 and R2 bindings.
- Add the initial users, exercises, answer schemas, submissions, and lectures schema.
- Add phone and password authentication, JWT middleware, teacher-created student accounts, and pending approval.
- Add the React Router application shell and login and registration pages.
- Add the Cloudflare Pages and Workers deployment pipeline.
