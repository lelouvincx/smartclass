# Release workspaces and curriculum in one maintenance window

Prepared locally on 14 September 2026 for [RFC-18](RFC-18-2026-09-13-curriculum-and-content-access.md). The coordinated cutover was executed later on 14 September and reopened both sites. Authenticated production acceptance remains pending. This runbook extends [RFC-17 Stage 3](RFC-17-stage-3-release.md); it replaces that document's workspace-only reopening sequence for this release.

## Recovery status on 14 September 2026

[PR #135](https://github.com/lelouvincx/smartclass/pull/135) merged. Its deployment stopped at the curriculum completion gate and left both APIs in maintenance. Read-only inspection confirmed that workspace cutover was complete, but the original maths mapping omitted 6 English videos.

Chinh approved the English hierarchy. Fresh read-only production validation passed for the combined mapping at the [deployed release](https://github.com/lelouvincx/smartclass/commit/8d849a08457f4596e7d7d417e59bb1daa42c45cf). All 12 source videos matched; every programme audience remained unchanged. Both target revisions were zero and both curricula were empty. The private comparison is `.amp/in/curriculum-release-recovery/production-bundle-comparison.json`.

The later recovery execution applied the combined bundle and reopened both APIs at merge commit [`e82de30`](https://github.com/lelouvincx/smartclass/commit/e82de300b085a8cf5f3fc0bdc5af1b433ead79fa). Do not repeat the completed workspace or curriculum backfills.

## Production execution record on 14 September 2026

The private release artifacts under `.amp/in/curriculum-release-recovery/` record the completed state:

- `merge137-apply.json` reports `complete: true`, `workspace_cutover_complete: true`, mapping SHA-256 `f1fac291ba96aa530861ff2f5b3b3b6cb2cd4d1a3d148bfaaee90072248b35aa`, and completion time `2026-09-14 17:21:42`.
- `merge137-after.json` records post-apply inspection at [`e82de30`](https://github.com/lelouvincx/smartclass/commit/e82de300b085a8cf5f3fc0bdc5af1b433ead79fa), captured at `2026-09-14T17:22:35.182Z`.
- `merge137-bookmark/d1-restore.json` records the restore bookmark captured for that run. The bookmark is historical evidence and is not assumed to be currently valid.
- `merge137-pages.json` records Pages production deployments sourced from `e82de30`.

GitHub Actions run [34873342437](https://github.com/lelouvincx/smartclass/actions/runs/34873342437) passed at `e82de30`. The run completed maintenance verification, workspace completion check, curriculum completion check, Pages deployment, API reopening and final open API probe.

On 19 September 2026, both production API hosts were publicly readable, reported `maintenance: false`, and returned current commit `2c17b8b877e4fb90b35d7d318976191ad5fb147f` from `/api/version`. Later deployments still pass the same completion gates before reopening. These public checks do not prove authenticated workspace isolation, Google configuration or pinned-attempt behavior.

## Do not replay or recover without approval

Merging to `main` starts `Deploy Worker`. Approval of a pull request can trigger automatic merge. A recovery, workflow rerun or replay can close both APIs, apply schema migrations, and refuse to reopen until both workspace and curriculum completion checks pass. Do not start a replay merely to refresh evidence.

If a future recovery needs maintenance, keep both APIs in maintenance until the reviewed recovery step completes. Pages Git builds can publish separately; coordinate those builds and prohibit competing Worker deployments, workflow reruns and database writers throughout the window.

### Chinh's actions

Before merge, approve the maintenance window, candidate PR, domain changes and production operator access. Confirm who will review the fresh workspace inventory, administrator grant and curriculum comparison during the window. Approve the test actors and any production test writes separately.

After maintenance starts, approve the refreshed mappings before either backfill. Chinh approved the maths mapping and the [English hierarchy](RFC-18-English-migration-review.vi.md). Together, the mappings cover 12 videos, 9 topics, 9 lessons and 31 placements. They preserve every source tier, visibility setting and programme set. Drift requires another review, not an automatic mapping update. Existing exercises stay Standard; no membership or exercise receives THPT automatically.

Approve reopening only after both completion checks and the recorded comparisons pass. Database restoration always needs separate approval identifying any writes that would be lost.

### Agent's actions

Before merge, complete the [RFC-17 configuration checklist](RFC-17-stage-3-release.md#check-production-configuration-before-release): domain attachments, Google origins/callbacks, secret presence and competing writers. Public DNS/TLS checks passed on 14 September: both frontends returned HTTP 200, and both API version endpoints returned the [same live commit](https://github.com/lelouvincx/smartclass/commit/76cb44fc9091242e88bc592949e5913f0a07cfb4). These reads do not verify account-level configuration, remote binding access or database cutover status.

Record the approved candidate commit. After merge, record the full merge hash as `RELEASE_COMMIT`; the operator verifies that deployed hash, not the PR head or a moving branch. Keep `main` fixed until the window ends. Use the pinned Node version and the approved 1Password-backed credential loader; do not save credential values.

Expected result: both sites reopen on the same reviewed release, with isolated workspace access and the approved curriculum. Existing video identity, visibility, tiers, programme audiences, attempts and R2 objects remain unchanged.

## Historical execution procedure

This procedure records the reviewed sequence for the 14 September coordinated cutover and remains the recovery reference. The commands are not authorization to run remote operations again.

1. Merge the approved PR in the agreed window. Save the resulting workflow run ID and full merge hash.
2. Wait for maintenance verification, request draining, the D1 restore bookmark and schema migrations. Save the bookmark artifact before expiry. Confirm that uploads, parsing jobs and all other writers have stopped; the workflow's 120-second wait is only a buffer.
3. Verify both APIs are closed at `RELEASE_COMMIT`. Check actual live state if the workflow fails or is cancelled; a recovery step is not proof of closure.
4. Complete the RFC-17 inventory, review, backfill and finalization using its operator. If already complete, use its read-only check; do not repeat `apply`. Keep maintenance enabled.
5. Combine both reviewed curriculum mappings in a new private release directory. Inspect and validate against the frozen source using the commands below. Review every video's audience comparison and the inventory, not only row counts. Stop on source drift, unmapped videos, nonzero initial revisions or a nonempty target curriculum.
6. After approval to apply the validated mapping, run curriculum `apply` once. It revalidates both workspaces and writes both hierarchies, revisions and one completion marker in one D1 batch. Save the returned mapping hash and timestamp. Compare the hash with the validation report.
7. Run both read-only completion checks. Inspect again to compare source lecture fields, programme grants and exercise tiers with the pre-apply inventory. Keep all release evidence private.
8. After approval to reopen, rerun the normal workflow at the same merge hash. Both completion gates must pass before Pages deployment and API reopening. Do not use `maintenance_only` for this run.
9. Verify full API and frontend commit hashes on both sites. Run the approved permission checks below, then record the release outcome.

The following commands are prepared instructions, not authorization to run them remotely. Prefix Node commands with `mise exec --` locally. Run them through the approved credential loader. Use new filenames for each inventory or validation report; existing files are not overwritten.

```sh
node scripts/release-api.mjs closed "$RELEASE_COMMIT"
node scripts/workspace-release.mjs check --remote --commit "$RELEASE_COMMIT"

mkdir -p .amp/in/curriculum-release
node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises'
const files = ['worker/db/curriculum-mapping.json', 'worker/db/english-curriculum-mapping.json']
const workspaces = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, 'utf8'))))
await writeFile('.amp/in/curriculum-release/reviewed-mapping.json',
  JSON.stringify({ workspaces }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
NODE

node scripts/curriculum-release.mjs inspect --remote --commit "$RELEASE_COMMIT" \
  --output .amp/in/curriculum-release/before.json
node scripts/curriculum-release.mjs validate --remote --commit "$RELEASE_COMMIT" \
  --mapping .amp/in/curriculum-release/reviewed-mapping.json \
  --output .amp/in/curriculum-release/comparison.json

# Stop here for review and approval of the fresh comparison.
node scripts/curriculum-release.mjs apply --remote --commit "$RELEASE_COMMIT" \
  --mapping .amp/in/curriculum-release/reviewed-mapping.json --confirm-production

node scripts/workspace-release.mjs check --remote --commit "$RELEASE_COMMIT"
node scripts/curriculum-release.mjs check --remote --commit "$RELEASE_COMMIT"
node scripts/curriculum-release.mjs inspect --remote --commit "$RELEASE_COMMIT" \
  --output .amp/in/curriculum-release/after.json
```

The operator connects only to D1. Every remote command verifies maintenance and the full commit before connection and after work. `apply` checks maintenance again before backfill. These checks do not lock out manual D1 writers or another deployment; the operator must maintain the agreed write freeze.

`curriculum_cutover` is created by backfill, not by schema migration. The marker records the canonical reviewed-mapping SHA-256 and commits atomically with the hierarchy. There is no separate curriculum `finalize` command. Later releases check that marker, workspace completion and integrity, without requiring teachers' current curriculum to match the initial map. Valid later English content and unplaced teacher videos are allowed.

For compatibility with the deployed gate, the marker retains `workspace_id = 'maths'` as its release anchor. The hash covers the entire `{ workspaces: [maths, english] }` bundle. Do not apply the two mappings separately: each validation requires coverage of every source video in the database.

## Verify access after reopening

The automated smoke probe checks health, commit, public curriculum responses for each supported programme, and anonymous denial of `/api/lectures` and `/api/auth/me` on both hosts. It does not prove content ownership from an empty response or replace authenticated permission checks.

With approved actors, verify:

- Guest sees only placed, visible Guest videos; hidden and Standard/VIP direct URLs remain denied.
- Standard and VIP students receive only their programme-and-tier access; VIP alone does not grant THPT.
- A shared video opens with the correct lesson, previous/next sequence and return link in each programme.
- Each teacher can manage only their workspace. English cannot read maths content by ID, and maths cannot read English content.
- A previously started attempt and pinned results remain accessible under the existing ownership rules; new attempts respect current exercise access.

Use the [workspace scenarios](../../tests/e2e/teaching-workspaces/README.md) for the full permission matrix. Do not create production users, exercises or submissions without approval.

## Recover without losing the cutover state

| Failure | Action |
| --- | --- |
| Domain, maintenance, bookmark or draining check fails | Do not backfill. Keep or restore maintenance at the reviewed release. |
| Fresh source differs from the reviewed mapping | Stop. Review changed IDs, source fields and audiences with Chinh. Do not guess categories or approvals. |
| Curriculum apply reports an error or loses its connection | Keep maintenance enabled. Run `check` and `inspect` before deciding whether it committed. Never blindly rerun `apply`. |
| Marker exists but a later check fails | Do not delete the marker or force another backfill. Inspect integrity and repair forward under a separately reviewed change. |
| No marker but partial curriculum rows exist | Stop for investigation. Do not erase rows or manufacture a completion marker. |
| Pages, reopening or permission verification fails | Verify live maintenance state. Repair forward with workspace- and curriculum-aware code. |
| Restoration is required | Ask Chinh with the bookmark, restore window and writes at risk. D1 restore does not restore R2. |

Never deploy the old global-access application over workspace-owned data, or the old flat lecture API after curriculum edits. Retain legacy lecture fields and grade tables for comparison only. Keep R2 objects unchanged. A saved bookmark does not extend D1's restore window.

## Local rehearsal completed

The initial maths-only rehearsal exercised inspect, premature-check refusal, validation, drift refusal, atomic apply, successful check and repeat-write refusal. It preserved 6 videos and 7 programme rows, creating 5 topics, 5 lessons and 7 placements.

The recovery rehearsal used both approved mappings through the actual local operator. It preserved all 12 videos and 31 programme rows, created 31 placements, passed completion checks and refused repeat application. The validation and completion hashes matched the fresh production comparison. Integration tests also verified exact English placement order, 9 topics and 9 lessons, and atomic rollback on late English failure or revision drift.

All frontend, Worker, D1 integration and script tests, plus the production build, passed locally. Release probes passed against the mounted Worker for both production hostnames. The rehearsal made no production writes. The later production execution completed curriculum application and reopening. Authenticated production permission checks remain pending.
