# Release workspaces and curriculum in one maintenance window

Prepared locally on 14 September 2026 for [RFC-18](RFC-18-2026-09-13-curriculum-and-content-access.md). Production execution is not approved. This runbook extends [RFC-17 Stage 3](RFC-17-stage-3-release.md); it replaces that document's workspace-only reopening sequence for this release.

## Do not merge before the release window is approved

Merging to `main` starts `Deploy Worker`. Approval of the PR can trigger automatic merge. The first deployment closes both APIs, applies schema migrations, then refuses to reopen until both workspace and curriculum completion checks pass. Expect that first run to fail closed if either backfill has not run.

Keep both APIs in maintenance while completing RFC-17 and RFC-18. Do not reopen between them. Pages Git builds can publish separately; coordinate those builds and prohibit competing Worker deployments, workflow reruns and database writers throughout the window.

### Chinh's actions

Before merge, approve the maintenance window, candidate PR, domain changes and production operator access. Confirm who will review the fresh workspace inventory, administrator grant and curriculum comparison during the window. Approve the test actors and any production test writes separately.

After maintenance starts, approve the refreshed mappings before either backfill. The curriculum mapping already approved by Chinh contains 6 videos, 5 topics, 5 lessons and 7 placements. It preserves every source tier, visibility setting and programme set. Drift requires another review, not an automatic mapping update. Existing exercises stay Standard; no membership or exercise receives THPT automatically.

Approve reopening only after both completion checks and the recorded comparisons pass. Database restoration always needs separate approval identifying any writes that would be lost.

### Agent's actions

Before merge, complete the [RFC-17 configuration checklist](RFC-17-stage-3-release.md#check-production-configuration-before-release): domain attachments, Google origins/callbacks, secret presence and competing writers. Public DNS/TLS checks passed on 14 September: both frontends returned HTTP 200, and both API version endpoints returned the [same live commit](https://github.com/lelouvincx/smartclass/commit/76cb44fc9091242e88bc592949e5913f0a07cfb4). These reads do not verify account-level configuration, remote binding access or database cutover status.

Record the approved candidate commit. After merge, record the full merge hash as `RELEASE_COMMIT`; the operator verifies that deployed hash, not the PR head or a moving branch. Keep `main` fixed until the window ends. Use the pinned Node version and the approved 1Password-backed credential loader; do not save credential values.

Expected result: both sites reopen on the same reviewed release, with isolated workspace access and the approved curriculum. Existing video identity, visibility, tiers, programme audiences, attempts and R2 objects remain unchanged.

## Execute only after production approval

1. Merge the approved PR in the agreed window. Save the resulting workflow run ID and full merge hash.
2. Wait for maintenance verification, request draining, the D1 restore bookmark and schema migrations. Save the bookmark artifact before expiry. Confirm that uploads, parsing jobs and all other writers have stopped; the workflow's 120-second wait is only a buffer.
3. Verify both APIs are closed at `RELEASE_COMMIT`. Check actual live state if the workflow fails or is cancelled; a recovery step is not proof of closure.
4. Complete the RFC-17 inventory, review, backfill and finalization using its operator. If already complete, use its read-only check; do not repeat `apply`. Keep maintenance enabled.
5. Copy the reviewed curriculum mapping into a new private release directory. Inspect and validate against the frozen source using the commands below. Review every video's audience comparison and the inventory, not only row counts. Stop on source drift, unmapped videos, legacy English videos, nonzero initial revision or a nonempty target curriculum.
6. After mapping approval, run curriculum `apply` once. It revalidates the source and writes the hierarchy, revision and completion marker in one D1 batch. Save the returned mapping hash and timestamp. Compare the hash with the validation report.
7. Run both read-only completion checks. Inspect again to compare source lecture fields, programme grants and exercise tiers with the pre-apply inventory. Keep all release evidence private.
8. After approval to reopen, rerun the normal workflow at the same merge hash. Both completion gates must pass before Pages deployment and API reopening. Do not use `maintenance_only` for this run.
9. Verify full API and frontend commit hashes on both sites. Run the approved permission checks below, then record the release outcome.

The following commands are prepared instructions, not authorization to run them remotely. Prefix Node commands with `mise exec --` locally. Run them through the approved credential loader. Use new filenames for each inventory or validation report; existing files are not overwritten.

```sh
node scripts/release-api.mjs closed "$RELEASE_COMMIT"
node scripts/workspace-release.mjs check --remote --commit "$RELEASE_COMMIT"

mkdir -p .amp/in/curriculum-release
cp worker/db/curriculum-mapping.json .amp/in/curriculum-release/reviewed-mapping.json

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

The disposable local rehearsal exercised the actual operator: inspect, premature-check refusal, validation, drift refusal, atomic apply, successful check and repeat-write refusal. It preserved 6 source videos and 7 legacy programme rows, created 5 topics, 5 lessons and 7 placements, and produced no audience differences. Validation and completion hashes matched. Later English authoring still passed readiness.

Release probes also passed against the final mounted Worker for both production hostnames in a local test environment. The only live checks were unauthenticated HTTPS reads described above. No production writes occurred. Remote binding access, account-level configuration, maintenance, backfill, authenticated production checks and reopening remain unverified until the approved window.
