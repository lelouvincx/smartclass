# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Add a workspace administrator Guest delivery estimator and user manual. The estimator inventories ready public Guest content and models hypothetical request, R2 read and recorded-byte volume without visitor tracking or monetary pricing. [#146](https://github.com/lelouvincx/smartclass/pull/146)
- Add opt-in structured Worker request logs, convert active production error and audit logs to Cloudflare-indexable objects, and extend release probes to monitor the public Guest exercise list on both production API hosts. [#143](https://github.com/lelouvincx/smartclass/pull/143)
- Add Guest exercise mode with public exercise routes, IndexedDB attempt storage, local grading, reviewable local results, public PDF/image reads and an RFC for registration prompts, monitoring and cost controls. [#141](https://github.com/lelouvincx/smartclass/pull/141)
- Prompt engaged Guest exercise visitors to register after they submit one local attempt or start a second local attempt in the same workspace. The prompt states that existing guest results stay on the current device. [#142](https://github.com/lelouvincx/smartclass/pull/142)
- Include the approved English curriculum mapping in one atomic maths-and-English backfill. Validate all 12 source videos, preserve access, and reject partial mappings without bypassing the deployment gate. Production application remains pending. [#137](https://github.com/lelouvincx/smartclass/pull/137)
- Organize reusable lectures by programme, topic, lesson and unit with independent access tiers, teacher management and reviewed local migration mapping. Production cutover remains pending. [#135](https://github.com/lelouvincx/smartclass/pull/135)
- Keep route-guard tests offline by mocking dashboard lecture and submission requests. Reject unexpected network calls so missing mocks fail instead of stalling test-worker shutdown.
- Clarify agent guidance for the pinned Node toolchain, thread-specific PR cleanup, page/API contract tests, and documentation skills. Permanently approve local SmartClass browser acceptance and replace the stale Cohere provisioning note with a credential presence probe.
- Resize the desktop curriculum panes by dragging their divider or using the keyboard, with minimum widths for navigation and lesson content.
- Use the shared design-system Select for curriculum programme choices, including the styled menu and keyboard selection.
- Let users hide and reopen the desktop curriculum pane without losing the selected lesson. Keep teacher lesson actions available when the pane is hidden.
- Add a web app manifest and SmartClass home-screen icons for standalone mobile installation. The app remains online-only, with no service worker or offline caching. [#134](https://github.com/lelouvincx/smartclass/pull/134)
- Integrate direction B's curriculum navigator, contextual player and teacher management locally. Add shared-video audience confirmations, revision-safe ordering, retained failed drafts and unsaved-change guards. Mount the matching curriculum and lecture APIs; browser-free tests cover the combined contracts. Rendered acceptance and review with Chinh remain pending.
- Connect maths-only THPT choices to membership and exercise forms, preserving existing grants and English programme choices. Add Standard/VIP exercise controls without granting THPT automatically.
- Add workspace curriculum and shared-video APIs with atomic revision checks, scoped ordering and contextual playback. Enforce Standard/VIP exercise access locally, preserving owned attempts and pinned content while blocking restricted replacement metadata. No production migration or deployment has run.
- Add RFC-18's local curriculum storage foundation and reviewed backfill for 6 videos in 7 placements. D1 tests cover unchanged source fields and audiences, workspace ownership, source drift, stale revisions and atomic rollback. Production cutover remains pending.
- Record Chinh's approved placements for all 6 production lectures in a Vietnamese review table, preserving programmes, tiers and visibility. Video 2 stays in both Khối 12 and ĐGNL; production changes remain unapproved.
- Document the agreed curriculum and access model in a Vietnamese teacher manual and RFC-18, including THPT, shared-video placements, independent tiers and the selected direction B navigator.
- Prepare isolated Maths and English teaching workspaces, interactive QA scenarios and the maintenance-first release workflow. Production cutover remains a separate approved operation. [#133](https://github.com/lelouvincx/smartclass/pull/133)
- Document the maths and English workspace plan, shared-account rules, proposed platform administrator role, migration safeguards and acceptance tests in RFC-17. The feature remains planned, not shipped.
- Record Stage 1 workspace research, the 50-route access inventory and a verified synthetic local database export/import rehearsal.
- Complete Stage 1 decisions: maths assignments, administrator identity and password prerequisite confirmed; preserve empty programmes and pending status for the 4 students without programmes. No production migration has run.
- Add RFC-17's local database foundation: additive workspace and membership schema, plus a separately invoked backfill requiring a complete reviewed mapping. Tests preserve credentials, Google links, content, attempts, scores and file bytes, including pending students without programmes and atomic rollback. No production backfill or administrator grant has run.
- Mount workspace-aware account, student, exercise, question-set, submission, lecture and file routes behind exact host mapping and workspace-bound tokens. Tests cover foreign IDs, independent memberships, shared credentials, explicit joining, administrator-only global blocks and programme assignment before separate approval.
- Preserve exercise-edit safeguards and pinned attempts during workspace isolation. Add regression checks for concurrent exercise and question-set creation, empty schema rollback, and changed assets during activation validation.
- Connect the frontend to separate shared identity and workspace membership, site labels, teacher routing without session transfer, join and status screens, and confirmed administrator controls. This feature is not deployed.
- Clear the departing site's token during teacher routing to prevent crossed teacher sessions from redirecting between sites repeatedly. Focused tests and the live regression pass.
- Reserve space for long workspace rename titles beside the close button, stack student details on narrow screens, and let selected-answer controls wrap without reducing answer touch targets.
- Complete RFC-17 Stage 2 locally: browser-check both workspaces, account controls, submissions and saved teacher content. Record inspected mobile/desktop evidence and coverage limits. No production changes have run.
- Run frontend tests in one thread pool and integration tests in one Worker, retaining isolated storage and existing timeouts. The final full suites pass without concurrent-worker resource failures.
- Persist 7 interactive workspace end-to-end scenarios as separate files under `tests/e2e/teaching-workspaces/`, with a shared setup index, expected results, cleanup rules, parallel ownership and a local-only helper that creates fresh synthetic accounts without resetting existing users.
- Complete all 7 local interactive scenarios. Record passing [access checks](tests/e2e/runs/2026-09-10-access.md) and [learning/content checks](tests/e2e/runs/2026-09-10-learning-content.md), restored test content and memberships, browser closure, inspected screenshots and unresolved transient sign-in observations. No production changes ran.
- Prepare the [simpler Stage 3 release](docs/plans/RFC-17-stage-3-release.md) in the existing deployment workflow: application maintenance before D1 migrations, a restore bookmark, readiness checks, frontend deployment and verified reopening. Add a separate reviewed backfill operator and atomic ownership constraints, with failure recovery that keeps maintenance enabled. Live deployment automation and production remain unchanged.
- Let teachers upload or drag and drop replacement question screenshots and teacher-only answer-detail screenshots during exercise question review. [#132](https://github.com/lelouvincx/smartclass/pull/132)
- Add a non-product Pillow-based vision question-locator POC script with ruler overlays, structured box validation, and crop previews. [#128](https://github.com/lelouvincx/smartclass/pull/128)
- Add an isolated experimental Cohere Parse blocks adapter for Answer PDF table extraction. [#128](https://github.com/lelouvincx/smartclass/pull/128)
- Let teachers choose whether students can download an exercise's Answer PDF after submitting and reviewing their work. [#125](https://github.com/lelouvincx/smartclass/pull/125)
- Add ĐGNL as an access class for students, exercises, and lectures alongside grades 10 to 12. [#116](https://github.com/lelouvincx/smartclass/pull/116)
- Add teacher-assigned Standard and VIP student tiers, lecture minimum tiers, and a public Guest workspace with lecture browsing, playback, language selection, and a disabled coming-soon exercise destination. [#116](https://github.com/lelouvincx/smartclass/pull/116)
- Let teachers keep automatic score weighting or allocate exactly 10.0 points across exercise questions during creation and question-set activation. [#118](https://github.com/lelouvincx/smartclass/pull/118)
- Let teachers list completed student submissions on an exercise and open each submission's question-first review. [#114](https://github.com/lelouvincx/smartclass/pull/114)
- Let teachers remove students from the active student list while preserving past submissions and blocking removed accounts. [#125](https://github.com/lelouvincx/smartclass/pull/125)
- Let teachers deactivate and reactivate student accounts from the student list. [#125](https://github.com/lelouvincx/smartclass/pull/125)
- Let self-registering students select programmes so teachers can see requested programme access before approval. [#125](https://github.com/lelouvincx/smartclass/pull/125)
- Let teachers set a finite or unlimited exercise attempt limit, allocate stable numbered student attempts, and let students open every attempt’s separate score and review from the exercise or submission history. [#109](https://github.com/lelouvincx/smartclass/pull/109)
- Support exercise PDFs whose question numbering restarts in named sections while preserving one global grading and navigation order. [#104](https://github.com/lelouvincx/smartclass/pull/104)

### Changed

- Reconcile the 14 September production release record. Production evidence records the combined workspace and curriculum cutover, both completion gates, Pages deployment and API reopening at `e82de30`. Later deployments continue to pass both gates. Authenticated production permission and pinned-attempt acceptance remain pending. [#147](https://github.com/lelouvincx/smartclass/pull/147)
- Reprioritize the roadmap around release verification, account recovery, student profiles and teacher insights. Consolidate cutover tasks, remove stale photo-extraction work, and specify recovery security, profile permissions, explanation visibility, activity metrics and routine deployment requirements.
- Clarify agent guidance for structured production logging, release probes, and reusable evidence packets. [#144](https://github.com/lelouvincx/smartclass/pull/144)
- Make the student lecture browser match the teacher curriculum navigator with a wide compact workspace, segmented programme buttons, selected-lesson detail pane, and protected lecture-access regressions. [#140](https://github.com/lelouvincx/smartclass/pull/140)
- Replace the student lecture navigator with a content-first course outline that shows topic sections, lesson cards and playable units immediately while preserving teacher curriculum management. [#139](https://github.com/lelouvincx/smartclass/pull/139)
- Polish the teacher lecture view with a compact programme selector, icon-led curriculum outline, clickable breadcrumbs, collapsed edge-case videos and automatic sidebar collapse on entry. [#138](https://github.com/lelouvincx/smartclass/pull/138)
- Replace the legacy dbdocs package with the unified dbdiagram CLI for schema publishing. Use DBDIAGRAM_TOKEN and the explicit lelouvincx/smartclass document destination. [#136](https://github.com/lelouvincx/smartclass/pull/136)
- Prepare the coordinated workspace and curriculum release: require both completion markers before reopening, add a maintenance-gated curriculum operator with atomic completion and source-drift checks, and verify current public API contracts. Production execution remains unapproved. [#135](https://github.com/lelouvincx/smartclass/pull/135)
- Keep video access controls and long player breadcrumbs within narrow screens. Verify curriculum dialogs, join and exercise controls, player failure states, and recorded resize/reorder interactions with local fixtures. [#135](https://github.com/lelouvincx/smartclass/pull/135)
- Move workspace and audience labels from the brand header to the expanded sidebar and mobile drawer footer. Keep Settings and logout reachable and preserve the compact navigation rail.
- Polish exercise question-review upload cards, per-question score allocation, submissions rows, and reject-preview wording. [#132](https://github.com/lelouvincx/smartclass/pull/132)
- Show active exercise question views in the same per-question layout used while creating and editing exercises. [#132](https://github.com/lelouvincx/smartclass/pull/132)
- Place each question's score allocation alongside its Exercise PDF crop, Answer PDF crop, and answer review in the Question views workflow. [#132](https://github.com/lelouvincx/smartclass/pull/132)
- Replace em dash punctuation across code comments, tests, documentation, and localized copy. [#130](https://github.com/lelouvincx/smartclass/pull/130)
- Align loading spinners and progress bars with Material Design 3 progress indicators. [#129](https://github.com/lelouvincx/smartclass/pull/129)
- Use Google Material Symbols for app icons and remove the Lucide icon dependency. [#129](https://github.com/lelouvincx/smartclass/pull/129)
- Standardize shared UI primitives against the Material 3 component adoption plan. [#129](https://github.com/lelouvincx/smartclass/pull/129)
- Document the Material 3 component adoption plan for shared UI primitives, missing components, deferred components, rollout order, and review gates. [#129](https://github.com/lelouvincx/smartclass/pull/129)
- Merge create-stage question-view crops with per-question answer review controls, including teacher-only Answer PDF previews below Exercise PDF crops. [#128](https://github.com/lelouvincx/smartclass/pull/128)
- Insert manual-review answer rows when parsed Answer PDFs skip source question numbers, so teachers can fill gaps before question-view generation. [#128](https://github.com/lelouvincx/smartclass/pull/128)
- Keep teachers on exercise creation to prepare and activate question views immediately after reading answers from PDF, before saving, while keeping safe partial question views for teacher replacement when some markers are missing. [#128](https://github.com/lelouvincx/smartclass/pull/128)
- Default student programme selectors to Grade 12 instead of all programmes. [#127](https://github.com/lelouvincx/smartclass/pull/127)
- Allow the production API to accept the alternate frontend domain `tienganhcothuy.com` alongside `toanthaythanh.com`. [#126](https://github.com/lelouvincx/smartclass/pull/126)
- Replace DeepSeek with Cohere Parse v5 for Answer PDF and student answer-photo extraction, with deterministic parsing and safe abstention for ambiguous results. [#119](https://github.com/lelouvincx/smartclass/pull/119)
- Use the shared checkbox dropdown for every teacher programme selection, including the lecture form. [#124](https://github.com/lelouvincx/smartclass/pull/124)
- Present submission scores in a compact “score / 10” format, highlight submitted and correct answers with semantic design-system colors, and use a compact navigation rail for detailed reviews. [#117](https://github.com/lelouvincx/smartclass/pull/117)
- Turn the teacher sidebar’s Create action into a menu for starting an exercise, lecture, or student creation flow. [#115](https://github.com/lelouvincx/smartclass/pull/115)
- Run GitHub Actions on the Node 24 runtime by upgrading `actions/checkout` and `actions/setup-node` to v5, removing the deprecated Node 20 actions. [#106](https://github.com/lelouvincx/smartclass/pull/106)
- Default the authenticated teacher and student application to Vietnamese while preserving saved language preferences. [#107](https://github.com/lelouvincx/smartclass/pull/107)
- Move the production frontend and API to `toanthaythanh.com` and retire the former `smartclass.lelouvincx.com` hostnames. [#105](https://github.com/lelouvincx/smartclass/pull/105)
- Simplify exercise forms with a compact grade selector that defaults to grade 12, a blank duration field in untimed mode, the default image-extraction model, and distinct Exercise PDF and Answer PDF colors.
- Collapse every Settings section by default while keeping each section independently expandable. [#103](https://github.com/lelouvincx/smartclass/pull/103)
- Refine the dedicated lecture viewer so the title, player, local playback-resume cue, YouTube fallback, and previous/next navigation read as one focused learning sequence. [#101](https://github.com/lelouvincx/smartclass/pull/101)

### Deprecated

### Removed

### Fixed

- Replace the student submission history table with responsive attempt cards so scores, metadata, and review actions stay readable on desktop and mobile. [#131](https://github.com/lelouvincx/smartclass/pull/131)
- Ignore or clip unusable PDF text geometry before question-view detection so selectable PDFs with stray text items can still generate previews. [#128](https://github.com/lelouvincx/smartclass/pull/128)
- Vertically center Standard and VIP options in teacher access-tier radio cards. [#120](https://github.com/lelouvincx/smartclass/pull/120)
- Treat Answer PDF parses with no extracted answer rows as recoverable manual-entry failures instead of showing a false ready state, and read green-highlighted or detailed-solution MCQ choices from worked-solution PDFs. [#122](https://github.com/lelouvincx/smartclass/pull/122)
- Show the authenticated PDF viewing action for both Exercise PDFs and teacher-only Answer PDFs. [#113](https://github.com/lelouvincx/smartclass/pull/113)
- Let teachers open lectures on dedicated detail pages with previous and next navigation. [#112](https://github.com/lelouvincx/smartclass/pull/112)
- Show exercise readiness with semantic green success and amber warning treatments. [#111](https://github.com/lelouvincx/smartclass/pull/111)
- Keep D1 deployment migrations compatible with Cloudflare's remote parser when creating the submission attempt trigger. [#110](https://github.com/lelouvincx/smartclass/pull/110)
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
