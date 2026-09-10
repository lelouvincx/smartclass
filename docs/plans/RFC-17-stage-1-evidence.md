# Workspace migration preparation

Stage 1 of [RFC-17](RFC-17-2026-09-09-teaching-workspaces.md), checked on 10 September 2026.
Status: complete. Chinh approved all migration inputs, including the missing-programme policy.
Stage 1 made no application changes, production writes, deployments or account changes.

## Production changed since the first snapshot

| Check | Result |
| --- | --- |
| Users | 26: 3 teachers, 14 active students, 9 pending students |
| Student tiers | All 23 students are Standard |
| Student programmes | 28 rows; 4 pending students have no programme rows |
| Exercises and lectures | 2 exercises and 5 lectures, unchanged |
| Attempts | 9: 7 completed, 2 unfinished |
| D1 migration ledger | 23 applied migrations, through `0022_add_question_answer_assets.sql` |
| D1 schema | Refreshed table, index and trigger definitions; no workspace schema yet |
| Pages domains | `toanthaythanh.com` and `tienganhcothuy.com` on the existing project |
| Frontend checks | Both domains resolve and return HTTP 200 over HTTPS |
| English API hostname | `api.tienganhcothuy.com` does not resolve yet |
| API version | Matches the researched [production commit](https://github.com/lelouvincx/smartclass/commit/63d8448415b9aa2fd3ff4a6370576cd4646773b6) |
| Time Travel | Read-only bookmark lookup succeeds; no restore attempted |

The extra pending registration means the old account count cannot be a migration constant.
Repeat the inventory after writes are gated, immediately before migration.

Private evidence is under the ignored `.amp/in/workspace-stage-1/` directory:

- `production-inventory.json`: account IDs, names, access values, content and attempt counts; no phones, passwords or hashes
- `production-schema.json`: current schema definitions
- `mapping-review.md`: the approved account and content mapping
- `recovery-rehearsal.json`: synthetic local restore results

These local files are not a production backup and must not be committed.

## Decisions confirmed before Stage 2

Chinh confirmed:

- both exercises and all 5 lectures belong to maths
- all 23 existing students start in maths
- user 1 is Chinh's administrator account
- Chinh manually changed the default password and confirmed a fresh sign-in; no credential value was shared or recorded
- the 4 students without programmes stay pending, with empty programme sets

Teachers must assign at least one programme before approving these students.
Assignment and approval remain separate actions. Migration must not invent programme access.
The private mapping identifies these students. No Stage 1 decision remains open.

## All 50 current API routes need an explicit access rule

The route subagent's initial count was inconsistent. Direct declaration counting confirmed 50 routes: 48 mounted routes and 2 direct routes.
The table below covers every method and full path once.
Paths link to the owning source file, not a proposed new module.

Current guards: `public`, `auth` (current active global account), `teacher` (auth plus global teacher role), and `optional` (guest or auth).
Target guards: `identity`, `student` (active current membership), `manage` (workspace teacher or platform administrator), and `public`.
Every target guard also checks global account status where credentials are supplied.
Every protected record lookup must reject another workspace before applying its existing disclosure rules.

| Method and path | Owner | Current guard | Target guard and ownership lookup |
| --- | --- | --- | --- |
| GET `/api/health` | [index](../../worker/index.js) | public | Public, workspace-neutral |
| GET `/api/version` | [index](../../worker/index.js) | public | Public, workspace-neutral |
| POST `/api/auth/register` | [auth](../../worker/routes/auth.js) | public | Current host workspace; new identity and pending membership |
| POST `/api/auth/login` | auth | public | Verify identity; current membership or configured teacher redirect |
| PUT `/api/auth/password` | auth | auth | Identity, own shared credentials; preserve the approved product scope |
| PUT `/api/auth/name` | auth | auth | Identity, own shared name |
| GET `/api/auth/me` | auth | auth | Identity plus current workspace and membership state |
| POST `/api/auth/google/login` | auth | public | Verify linked identity and exact site callback; teacher routing |
| POST `/api/auth/google/link` | auth | auth | Identity, own shared link and exact callback |
| DELETE `/api/auth/google/link` | auth | auth | Identity, own shared link |
| GET `/api/users` | [users](../../worker/routes/users.js) | teacher | Manage, current workspace's student memberships |
| POST `/api/users` | users | teacher | Manage, new identity and current workspace membership |
| PUT `/api/users/grades` | users | teacher | Manage, all target memberships in current workspace |
| PUT `/api/users/access-tier` | users | teacher | Manage, all target memberships in current workspace |
| PUT `/api/users/:id/name` | users | teacher | Manage, local display name on target membership |
| DELETE `/api/users/:id` | users | teacher | Manage, disable target membership, retain identity and attempts |
| PUT `/api/users/:id/status` | users | teacher | Manage, target membership only |
| PUT `/api/users/:id/approve` | users | teacher | Manage, pending target membership only |
| POST `/api/exercises/schema/parse` | [exercises](../../worker/routes/exercises.js) | teacher | Manage, current workspace context; no persisted exercise yet |
| GET `/api/exercises` | exercises | auth | Manage or student, workspace exercises plus existing access rules |
| GET `/api/exercises/:id` | exercises | auth | Manage or student, exercise workspace; preserve pinned attempt access |
| POST `/api/exercises` | exercises | teacher | Manage, derive workspace from server context |
| PUT `/api/exercises/:id` | exercises | teacher | Manage, exercise workspace; validate every source file and active set |
| DELETE `/api/exercises/:id` | exercises | teacher | Manage, exercise workspace before DB or R2 deletion |
| POST `/api/exercises/:exerciseId/question-asset-sets` | [question assets](../../worker/routes/question-assets.js) | teacher | Manage, exercise workspace; source files in same exercise |
| POST `/api/exercises/:exerciseId/question-asset-sets/:setId/answer-candidates` | question assets | teacher | Manage, set belongs to exercise in current workspace |
| POST `/api/exercises/:exerciseId/question-asset-sets/:setId/assets` | question assets | teacher | Manage, set and exercise before R2 write |
| GET `/api/exercises/:exerciseId/question-asset-sets/:setId` | question assets | teacher | Manage, set and exercise before answer metadata disclosure |
| DELETE `/api/exercises/:exerciseId/question-asset-sets/:setId` | question assets | teacher | Manage, set and exercise before R2 deletion |
| POST `/api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/reject` | question assets | teacher | Manage, question in set in workspace exercise |
| PUT `/api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/assets` | question assets | teacher | Manage, question in set before asset replacement |
| PUT `/api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/screenshot` | question assets | teacher | Manage, question in set before screenshot replacement |
| PUT `/api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/answer-screenshot` | question assets | teacher | Manage, question in set before answer-image replacement |
| GET `/api/question-assets/:assetId` | [asset files](../../worker/routes/question-asset-files.js) | auth | Manage or student, asset → set → exercise; current or pinned access |
| GET `/api/question-assets/answer/:assetId` | asset files | teacher | Manage, answer asset → set → exercise |
| POST `/api/upload/exercises/:id/files/upload` | [upload](../../worker/routes/upload.js) | teacher | Manage, exercise workspace before returning upload metadata |
| PUT `/api/upload/exercises/:exerciseId/files` | upload | teacher | Manage, exercise workspace before DB or R2 write; validate supplied key |
| GET `/api/submissions` | [submissions](../../worker/routes/submissions.js) | auth | Manage by workspace exercise, or student by own workspace history |
| POST `/api/submissions` | submissions | auth | Student, exercise workspace and current programme access |
| PUT `/api/submissions/:id/submit` | submissions | auth | Student, own attempt → exercise workspace; pinned schema |
| GET `/api/submissions/:id/exercise-pdf` | submissions | auth | Student, own attempt → exercise workspace → pinned PDF |
| GET `/api/submissions/:id/answer-pdf` | submissions | auth | Student, own submitted attempt → exercise workspace; answer-download permission |
| GET `/api/submissions/:id` | submissions | auth | Student owns attempt; manage sees completed only; exercise workspace |
| POST `/api/submissions/:id/extract` | submissions | auth | Student, own unfinished attempt → exercise workspace before upload or extraction |
| GET `/api/files/:fileId` | [files](../../worker/routes/files.js) | auth | Manage or student, file → exercise workspace; student-safe active source only |
| GET `/api/lectures` | [lectures](../../worker/routes/lectures.js) | optional | Current workspace; guest visibility or current membership policy or manage |
| POST `/api/lectures` | lectures | teacher | Manage, server workspace; workspace-local maximum order |
| PUT `/api/lectures/order` | lectures | teacher | Manage, all and only current workspace lecture IDs |
| PUT `/api/lectures/:id` | lectures | teacher | Manage, lecture workspace |
| DELETE `/api/lectures/:id` | lectures | teacher | Manage, lecture workspace |

New join and global block/restore routes are not part of the 50 original routes.
Stage 2 adds `POST /api/auth/join` and `PUT /api/users/:id/global-status`.
Reuse existing teaching handlers with explicit management checks, as the plan requires.
Keep `404` for cross-workspace direct IDs, including attempts owned by the same shared user.
Keep membership data authoritative after cutover; do not add legacy authorization fallbacks.

### Stage 2 route coverage

The local entry point mounts all 9 workspace routers.
Content scope tests use that entry point, not a substitute application.
Production still uses the original application until the controlled release.

| Router | Operations | Integration evidence |
| --- | --- | --- |
| `workspace-auth.js` | Registration, phone and Google login, current account, shared name/password, Google link/unlink, join | `workspace-auth.integration.test.js`, `auth-google.integration.test.js`, `auth-password.integration.test.js`, `users.integration.test.js`: account lifecycle, independent sign-ins, callback validation, programme approval and real-entry-point token rejection |
| `workspace-users.js` | Local student list/create/name/grades/tier/status/approve/remove; global block/restore | `workspace-users.integration.test.js`, `users.integration.test.js`: foreign targets, mixed bulk operations, local names, independent disablement and administrator protection |
| `workspace-exercises.js` | Schema parse, list, detail, create, update, delete | `workspace-exercises.integration.test.js` and existing exercise/parser tests: scoped access, answer hiding, activation guards, concurrent creation and full rollback |
| `workspace-question-assets.js` | All 9 set, candidate and image-management operations | `workspace-question-assets.integration.test.js` and existing question-asset tests: every endpoint rejects foreign IDs; sources belong to the exercise; empty schema rolls back; concurrent sets pin their own rows |
| `workspace-submissions.js` | List, start, submit, detail, extraction and 2 pinned PDF downloads | `workspace-submissions.integration.test.js` and existing submission/attempt tests: same-user foreign attempts, completed-only management review, pinned programme access, scoring and allocation |
| `workspace-lectures.js` | List, create, reorder, update, delete | `workspace-lectures.integration.test.js`: workspace lists, guest and live membership rules, foreign mutations, complete local reorder, concurrent creation and batch rollback |
| `workspace-files.js` | Exercise-file download | `workspace-files.integration.test.js`: workspace ownership, confirmed active source, membership programmes and private PDF access |
| `workspace-upload.js` | Upload metadata and file PUT | Same test file: foreign targets and keys leave R2 and D1 unchanged; current teacher uploads preserve streaming and existing metadata policy |
| `workspace-question-asset-files.js` | Question-image and answer-image downloads | Same test file: foreign IDs denied, answer images management-only, valid pins survive programme changes but not membership disablement |

Question-image pins must reference both the image's set and its owning exercise.
Tests include a corrupted cross-exercise pin, which grants no access.
Lecture creation allocates its ID in D1 and inserts programme rows in the same batch.
The batch captures the new lecture ID once before inserting multiple programme rows.

Final verification after browser fixes, 10 September 2026:

| Check | Result | Local log under `.amp/in/workspace-stage-2/` |
| --- | --- | --- |
| Frontend, single thread pool | 74 files, 687 tests passed | `frontend-final-threads.log` |
| Worker unit tests | 15 files, 161 tests passed | `worker-final-isolated.log` |
| Integration, serial Worker with isolated storage | 21 files, 362 tests passed | `integration-final-serial.log` |
| Production build | Passed; existing bundle-size warning | `build-final-isolated.log` |

The frontend run used `NODE_OPTIONS=--no-webstorage npx vitest run --pool=threads --maxWorkers=1` through `mise exec`.
`npm test` now uses the same Vitest arguments. The other checks used the repository's npm scripts.
The build ran with `GITHUB_SHA` unset to avoid stamping an unrelated commit into local source.
Migration tests preserve IDs, credentials, Google links, attempts, answers, scores and R2 bytes; they also verify rollback.

Earlier parallel runs timed out; their logs remain available rather than being treated as passes.
The final full runs passed after changing execution pools, without skips, mocks added for speed or longer timeouts.
Cloudflare's installed pool uses `singleWorker: true` to serialize files; Vitest's `maxWorkers` setting alone does not serialize that version.
`isolatedStorage: true` still isolates database and bucket writes between tests.

These are local fixture checks. They do not verify live Google configuration, English API DNS, production data or deployment safety.

### Local browser checks

On 10 September, Agent Browser used the real frontend and local Wrangler APIs on ports 5173/8787 and 5174/8788.
The isolated fixture contains 7 synthetic accounts, 8 memberships, 6 lectures and 3 exercises with matching R2 objects.
Setup and validation files are under `.amp/in/workspace-stage-2/qa/`; emulator data is under the sibling `qa-state/` directory.
The setup script resets only that disposable emulator directory. Stop its servers before rerunning setup.

Observed through the real browser and local API:

- English teacher login on maths reached the English sign-in page with no URL credentials or destination storage entries
- a separate English sign-in opened the English teacher dashboard and its workspace student list
- reverse login initially exposed a loop when each origin retained the other teacher's session; the fixed flow now reaches stable sign-in pages
- administrator global block and restore worked with explicit confirmation, preserving pending status and empty programmes
- pending and disabled members could open Settings but not learning content; explicit joining created a pending membership
- existing-phone registration preserved the identity and directed the person to sign in; new English registration requested approval

The routing gate now clears only the departing origin's token before redirect or chooser navigation.
It hides protected content while departing and preserves tokens when a destination fails validation.
The focused routing-gate, auth-context and router suites passed: 3 files, 25 tests.
The live crossed-session regression passed in both directions.

Browser-controller fixes restored process verification, viewport commands and graceful shutdown.
Chinh approved terminating the old verified session; recovery confirmed closure before replacement.
Screenshots now cover 390 × 844 and 1280 × 800 in light and dark themes, plus 320 × 568 and 844 × 390.
Responsive checks found and fixed a rename-title collision, a narrow student-name column and selected-answer overflow.
Post-fix screenshots show readable rename titles and long student names at 320px.
After selecting an answer, document width equals scroll width at all 4 tested sizes; the clear button wraps below the choices at 320px.
The new answer-control regression passed with the existing take-page tests: 43 tests.
Both workspace exercise flows reached submission and review; histories remained separate.
Maths VIP access succeeded while English VIP access was denied for the same student.
Changing the shared name on maths appeared in English Settings; the original name was restored and verified after reload.
Teacher programme assignment preserved pending status until a separate approval. Local disable and restore retained the assigned programmes.
Platform administrator login on English stayed on English and listed only English content.
Exercise metadata save, reload and restoration passed. Temporary lecture creation, editing, visibility, ordering and deletion passed through the interface.
The original lecture order remained intact after cleanup.
Detailed local evidence lives in `.amp/in/workspace-stage-2/{parent,student,teacher}-browser.md`; screenshots are under `.amp/in/artifacts/`.
All owned browsers reported `closed`; all QA listeners on ports 5173, 5174, 8787 and 8788 were stopped before final test runs.

Representative inspected captures for review, under `.amp/in/artifacts/`:

| Viewport and theme | Capture |
| --- | --- |
| 390 × 844 light | `rfc17-admin-global-confirm-mobile-light.png` |
| 390 × 844 dark | `rfc17-admin-global-confirm-mobile-dark.png` |
| 1280 × 800 light | `rfc17-admin-global-confirm-desktop-light.png` |
| 1280 × 800 dark | `rfc17-admin-global-confirm-desktop-dark.png` |
| 320 × 568 | `rfc17-student-answer-fixed-320.png` |
| 844 × 390 | `rfc17-student-answer-fixed-844.png` |

### Browser coverage limits

The journals record routes and states actually exercised, not a complete route-by-viewport-by-theme matrix.
Live Google consent, YouTube playback and Cohere extraction were not exercised; provider paths use integration fixtures.
Network-failure and loading states have fixture tests, not a separate browser simulation.
Exercise-detail headings truncate; the edit form exposes the full value. Mobile content forms require ordinary vertical scrolling to reach actions.
Lecture-dialog focus restoration and the below-fold next-lecture link were not fully inspected; no exhaustive screen-reader or reduced-motion audit was performed.
New assessment creation used automated fixtures rather than a live provider-backed browser flow.
These limits remain explicit for release review; Stage 2 does not certify production configuration or provider behavior.

### Password changes retain the published restriction

The previous password API used a general auth guard, although PRODUCT.md limits password changes to teachers.
The workspace API permits teachers and platform administrators to change only their own shared password.
`workspace-auth.integration.test.js` verifies student denial and administrator access.
Student password management remains in its existing roadmap scope.

## Recovery research and local rehearsal

Official references:

- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): 7 days on Free and 30 days on Paid
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/): exports can block database requests
- [D1 Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/): bookmark lookup, export and in-place restore

Billing tier was not established. Plan around the shorter 7-day window until it is confirmed.
The read-only bookmark lookup proves Time Travel is available, not that recovery has been tested in production.
Obtain a fresh bookmark immediately before the approved migration; today's bookmark is not a release checkpoint.

The local rehearsal uses 2 isolated Wrangler directories and a synthetic database ID.
It creates 2 exercises and 2 attempts with different IDs, scores and R2 key strings.
It exports SQL, deletes the source attempts, then imports the export into a separate empty local database.
The verification checks exact restored rows and `pragma foreign_key_check`.
Neither existing local application state nor remote data is involved.

This tests local SQL export/import mechanics only.
It does not test production Time Travel, full SmartClass schema recovery, session revocation or R2 object recovery.
See the [Stage 3 runbook](RFC-17-stage-3-release.md) for subsequent operator rehearsal and remaining production checks.

### Production recovery requires a separate approval

Commands below are a reference, not permission to execute them.
Run them only after the maintenance and recovery runbook is approved.

1. Enable and verify application maintenance. Chinh's later decision supersedes the independent-gate proposal; deploy only workspace-aware recovery code.
2. Record the current Worker/frontend versions, migrations, counts and a fresh D1 bookmark.
3. If approved, export D1 to encrypted private storage. The export includes account credentials and must never enter Git.
4. Apply the approved migration and deploy the workspace-aware application while access stays gated.
5. If recovery is needed, keep the gate closed and prefer a workspace-aware application repair or rollback.
6. Before a D1 restore, obtain approval for discarding writes after the selected bookmark.
7. After recovery, recheck database, application versions and R2 references before reopening either site.

```sh
# Read-only production bookmark lookup.
npx wrangler d1 time-travel info smartclass --json

# Production read/export: can block requests; private approved output only.
npx wrangler d1 export smartclass --remote --output <private-export-path>

# Destructive production restore: separate explicit approval required.
npx wrangler d1 time-travel restore smartclass --bookmark <approved-bookmark>
```

D1 recovery does not recover R2 objects, DNS, Worker code, secrets or the Pages deployment.
RFC-17 should preserve R2 keys and avoid object writes during migration.
Choose and approve any R2 backup separately before a release that changes objects.
Never reopen migrated workspace data under the old globally authorized backend.

The current deployment workflow applies migrations before deploying the Worker.
Stage 3 must replace that unsafe cutover order with the approved gate; a successful migration alone is not safe to release.
