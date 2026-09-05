# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Let teachers set a finite or unlimited exercise attempt limit, allocate stable numbered student attempts, and let students open every attempt’s separate score and review from the exercise or submission history. [#109](https://github.com/lelouvincx/smartclass/pull/109)
- Support exercise PDFs whose question numbering restarts in named sections while preserving one global grading and navigation order. [#104](https://github.com/lelouvincx/smartclass/pull/104)

### Changed

- Run GitHub Actions on the Node 24 runtime by upgrading `actions/checkout` and `actions/setup-node` to v5, removing the deprecated Node 20 actions. [#106](https://github.com/lelouvincx/smartclass/pull/106)
- Default the authenticated teacher and student application to Vietnamese while preserving saved language preferences. [#107](https://github.com/lelouvincx/smartclass/pull/107)
- Move the production frontend and API to `toanthaythanh.com` and retire the former `smartclass.lelouvincx.com` hostnames. [#105](https://github.com/lelouvincx/smartclass/pull/105)
- Simplify exercise forms with a compact grade selector that defaults to grade 12, a blank duration field in untimed mode, the default image-extraction model, and distinct Exercise PDF and Answer PDF colors.
- Collapse every Settings section by default while keeping each section independently expandable. [#103](https://github.com/lelouvincx/smartclass/pull/103)
- Refine the dedicated lecture viewer so the title, player, local playback-resume cue, YouTube fallback, and previous/next navigation read as one focused learning sequence. [#101](https://github.com/lelouvincx/smartclass/pull/101)

### Deprecated

### Removed

### Fixed

- Allow the production frontend domain to call the API so Google sign-in can complete. [#108](https://github.com/lelouvincx/smartclass/pull/108)
- Keep exercise creation controls and exercise-library tables usable without clipping on narrow and short-landscape viewports. [#102](https://github.com/lelouvincx/smartclass/pull/102)

### Security

## [0.5] - 2026-09-05

### Added

- Add teacher-managed grade 10–12 memberships, bulk student assignment, and grade-overlap access enforcement for exercises, lectures, and protected learning files. [#99](https://github.com/lelouvincx/smartclass/pull/99)
- Add names to student accounts, let teachers and students rename themselves, and let teachers rename students from the student list. [#99](https://github.com/lelouvincx/smartclass/pull/99)
- Remember each authenticated student's YouTube lecture position in the current browser and resume it after refresh or revisit without autoplay. [#97](https://github.com/lelouvincx/smartclass/pull/97)
- Let teachers show or hide individual lectures without deleting them, and keep hidden lectures unavailable to students. [#96](https://github.com/lelouvincx/smartclass/pull/96)
- Add migration-scoped agent guidance that keeps D1 migrations and `docs/schema.dbml` synchronized. [#95](https://github.com/lelouvincx/smartclass/pull/95)
- Add a persistent desktop sidebar toggle that switches between labelled and compact navigation. [#92](https://github.com/lelouvincx/smartclass/pull/92)
- Add automatic PDF question detection and image generation with complete teacher preview, per-question retry or screenshot replacement, answer-highlight blocking, and explicit activation. [#91](https://github.com/lelouvincx/smartclass/pull/91)
- Add the persistence and atomic API contracts for teacher-reviewed question asset sets, per-question screenshot replacement, version-pinned answer schemas, and derived-image delivery. [#91](https://github.com/lelouvincx/smartclass/pull/91)
- Combine Answer PDF parsing and deterministic green-highlight candidates from the teacher-only Answer PDF in one conflict-aware answer review that activates with question images derived from the separate student-safe Exercise PDF. [#91](https://github.com/lelouvincx/smartclass/pull/91)
- Document the accepted question-first exercise plan with automatic PDF-region detection, teacher confirmation, per-question screenshot replacement, and derived question images. [#91](https://github.com/lelouvincx/smartclass/pull/91)
- Let signed-in teachers securely change their own password from Settings after verifying their current password, with independently collapsible setting sections. [#87](https://github.com/lelouvincx/smartclass/pull/87)
- Add a production API version endpoint that reports the deployed commit hash and verify it after Worker deployments. [#86](https://github.com/lelouvincx/smartclass/pull/86)
- Add a dedicated, prioritized, and versioned todo list, link it from the README, and document the task lifecycle from planned work to completed change. [#82](https://github.com/lelouvincx/smartclass/pull/82)
- Add Google sign-in and account linking, including settings to link and unlink an account. [#68](https://github.com/lelouvincx/smartclass/pull/68) [#69](https://github.com/lelouvincx/smartclass/pull/69) [#70](https://github.com/lelouvincx/smartclass/pull/70)
- Add a changelog, move shipped-change history out of the README, and enforce changelog updates for every pull request. [#82](https://github.com/lelouvincx/smartclass/pull/82)
- Let teachers create student accounts and approve pending accounts. [#63](https://github.com/lelouvincx/smartclass/pull/63) [#64](https://github.com/lelouvincx/smartclass/pull/64)
- Let teachers add, edit, and reorder YouTube lectures with named sections. [#76](https://github.com/lelouvincx/smartclass/pull/76)
- Add a sectioned student lecture curriculum with embedded playback, readable lecture URLs, and previous/next navigation, and redesign teacher lecture management around the same ordered curriculum. [#88](https://github.com/lelouvincx/smartclass/pull/88)
- Add the Google-format design system, semantic tokens, responsive app shell, and shared product compositions. [#75](https://github.com/lelouvincx/smartclass/pull/75)

### Changed

- Publish the accumulated lecture and learning-experience work as v0.5 and advance planned work to v0.6. [#100](https://github.com/lelouvincx/smartclass/pull/100)
- Require light- and dark-mode visual QA evidence in pull request descriptions and close browser sessions during post-merge cleanup. [#98](https://github.com/lelouvincx/smartclass/pull/98)
- Make `DESIGN.md` a lintable Google DESIGN.md contract with machine-readable colors, typography, spacing, shapes, and component tokens. [#94](https://github.com/lelouvincx/smartclass/pull/94)
- Replace the student PDF iframe with synchronized isolated-question images and direct answer controls. Give desktop attempts a compact app rail, wide workspace, and narrow answer rail so questions remain dominant. On phones, place the selected question preview between the answer-sheet control and matching answer choices, open it in a full-screen pinch-and-button zoom viewer, retain an authenticated download of the complete answer-free Exercise PDF, and use the mobile header instead of a space-consuming sidebar in short landscape viewports. Remove the Manual/Photo selector and answer-photo upload from the take page. [#91](https://github.com/lelouvincx/smartclass/pull/91)
- Route answer-schema and image inference through DeepSeek's official API, using DeepSeek V4 Flash for text and DeepSeek V4 Flash Vision for images, with no OpenRouter dependency. [#93](https://github.com/lelouvincx/smartclass/pull/93)
- Align expanded lecture previews with their disclosure controls on desktop. [#90](https://github.com/lelouvincx/smartclass/pull/90)
- Make dashboards task-aware, show truthful exercise actions, prioritize the current question on mobile attempts, and clarify answer progress. [#89](https://github.com/lelouvincx/smartclass/pull/89)
- Use Material 3's default Roboto typeface throughout the application. [#87](https://github.com/lelouvincx/smartclass/pull/87)
- Add explicit bot PR and post-merge workflow triggers to repository instructions. [#86](https://github.com/lelouvincx/smartclass/pull/86)
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
