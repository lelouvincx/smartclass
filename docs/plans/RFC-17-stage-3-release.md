# Release teaching workspaces through the existing workflow

Stage 3 of [RFC-17](RFC-17-2026-09-09-teaching-workspaces.md), prepared locally on 10 September 2026.
Production remains unchanged. Publication, workflow execution and production writes require separate approval.

Chinh chose application maintenance in the existing `Deploy Worker` workflow instead of Cloudflare Access and WAF.
This supersedes the earlier independent-gate proposal. No Zero Trust onboarding or firewall change is required.

## What the workflow does

`.github/workflows/deploy-worker.yml` runs on `main` pushes or manual dispatches from `main`.
It tests and builds before changing production. Then it:

1. Deploys the workspace-aware Worker with `APP_MAINTENANCE:true`.
2. Verifies maintenance and the full commit on both API hosts.
3. Waits 120 seconds for existing requests.
4. Records a D1 Time Travel bookmark as a 7-day GitHub artifact.
5. Applies additive schema migrations.
6. Requires a completed, separately reviewed workspace backfill and ownership constraints.
7. Deploys Pages, reopens the API and verifies both sites.

The `maintenance_only` input stops after schema preparation. It leaves both APIs closed for the one-time backfill.
A normal first run also stays closed if the backfill is incomplete, but reports failure at the readiness check.
Later releases pass this check without repeating the backfill.

On failure after attempting the maintenance deployment, the workflow tries to deploy the same commit with maintenance enabled.
Cancellation or a Cloudflare outage can prevent that recovery step. Inspect the live API rather than assuming closure.
The workflow serializes its own releases and does not cancel a running release for a newer push.
It cannot serialize manual deployments, old workflow reruns or Pages Git builds.

## What maintenance protects

The first Worker middleware rejects every request with `503 MAINTENANCE`, except exact GET health and version paths.
It runs before authentication and database access. Responses are not cached.
The production manifest disables direct Worker and preview URLs and defaults maintenance to `true`.

This is an application control, not an independent Cloudflare gate.
Deploying old application code can remove it. After backfill, recover only with workspace-aware code and maintenance enabled.
The 120-second wait is an operational buffer, not proof that all long-running requests finished.
Before backfill, confirm that outstanding uploads, parsing and other writers have stopped. Preserve R2 objects unchanged.

## Chinh approves the production window

Before publication or execution, Chinh approves:

- the reviewed release commit, bot PR and merge
- the maintenance window, first workflow run, domain changes and production backfill
- the refreshed account and content mapping, including the administrator grant
- Google origin and callback changes, if needed
- any production test-account writes and reopening

The agent prepares commands and records results. Chinh supplies approvals and any account-console changes the agent cannot make.
Expected result: existing data remains intact, both sites require fresh sign-in, and each site exposes only its own teaching data.

## Check production configuration before release

The agent inspects the current account after approval, then records nonsecret results under `.amp/in/workspace-stage-3/`:

- both API domains route to the existing `smartclass-api` Worker, with active TLS
- the maths domain attachment is compatible with the proposed Custom Domain configuration
- the `smartclass` Pages project serves both frontend domains
- existing Worker secrets are present, without printing or rotating their values
- no competing deployment or other D1/R2 writer will run during backfill

The last read-only snapshot found no English API DNS address. Domain activation may need time before verification succeeds.
Keep maintenance enabled until both hosts pass. The manifest does not establish Google configuration.

| Google setting | Maths | English |
| --- | --- | --- |
| JavaScript origin | `https://toanthaythanh.com` | `https://tienganhcothuy.com` |
| Redirect URI | `https://toanthaythanh.com/auth/google/callback` | `https://tienganhcothuy.com/auth/google/callback` |

Keep the existing JWT and Google secrets. Resolve operator credentials at execution through the approved 1Password-backed loader.
Do not save secret values in environment files, inventory files or this document.
Pages Git builds can publish separately. Coordinate them to use the reviewed commit and finish before final frontend verification.
A brief frontend/backend mismatch is accepted; concurrent data writes during backfill are not.

## Run the first release after approval

Owner: agent, using the approved full commit. Run all commands from the repository root with locked dependencies installed.

1. Record the reviewed full commit and ensure no competing release is running.
2. Publish and merge through the bot PR after authorization. The `main` push starts the release automatically.
3. Expect the first run to stop closed at the incomplete-cutover check. Alternatively, use an approved `maintenance_only` run.
4. Save the workflow run ID, D1 bookmark artifact and deployed Worker version. Preserve the bookmark beyond artifact expiry if needed.
5. Confirm request draining and verify maintenance again before reading the final inventory.
6. Inspect the database with the operator command below.
7. Build and review the complete mapping from that inventory. Reconfirm IDs and access settings, not only totals.
8. Apply the mapping and finalization through the operator.
9. Run the normal workflow again at the same approved commit. Keep `main` unchanged during this sequence.
10. Check both frontend versions and run the approved production permission checks after reopening.

Remote commands below require production approval. Set `RELEASE_COMMIT` to the reviewed full hash, not a branch name.
Credentials enter the command environment only through the approved loader.

```sh
node scripts/release-api.mjs closed "$RELEASE_COMMIT"
node scripts/workspace-release.mjs inspect --remote --commit "$RELEASE_COMMIT" \
  --output .amp/in/workspace-stage-3/inventory.json
node scripts/workspace-release.mjs apply --remote --commit "$RELEASE_COMMIT" \
  --mapping .amp/in/workspace-stage-3/reviewed-mapping.json --confirm-production
node scripts/workspace-release.mjs check --remote --commit "$RELEASE_COMMIT"
```

The inventory contains IDs, legacy roles, status, tier, programmes and content ownership, without credentials or names.
Output creation refuses to overwrite an existing file. Keep inventory and reviewed mapping private under `.amp/in/`.
The [mapping contract](RFC-17-2026-09-09-teaching-workspaces.md#stage-2-build-and-test-locally) requires every existing user, exercise and lecture exactly once.
Preserve the 4 pending students with empty programmes. Recheck the previously approved administrator and teacher IDs against fresh inventory.

`apply` calls `backfillWorkspaces` once, then validates exact mapped rows and installs ownership constraints with a completion marker.
The backfill uses one D1 batch. The final constraints and marker use a separate atomic batch.
An error after backfill may leave the backfill committed. Do not blindly repeat `apply`.
After inspecting that state, `finalize` with the same reviewed mapping can finish the remaining step.
Repeated finalization is refused; use `check` to inspect completed state.

The operator has no application HTTP endpoint. It uses a DB-only Wrangler binding proxy.
Local operation requires `--local --persist-to <disposable-state>`; remote operation requires `--remote --commit <full-hash>`.
Remote writes also require `--confirm-production`. These flags confirm intent; they do not replace Chinh's approval.

## Verify and recover without old application code

`release-api.mjs` uses only GET requests, without login tokens, on both production API domains.
Closed checks require real diagnostics at the expected commit and `503 MAINTENANCE` on public content and authentication reads.
Open checks require own-workspace public lectures and rejection of anonymous account reads.
These probes do not prove the full permission matrix or production write rejection.
Run the [workspace scenarios](../../tests/e2e/teaching-workspaces/README.md) only with approved production actors and mutations.

| Failure | Agent action |
| --- | --- |
| Missing domain, failed bookmark or unfinished writer | Keep maintenance enabled. Resolve before backfill. |
| Mapping mismatch | Refresh and review inventory before writing. |
| Backfill or finalization error | Inspect committed state; keep maintenance enabled. Use `finalize` only after confirming backfill matches. |
| Readiness, frontend or open-API check fails | Inspect the failure and maintenance recovery step. Repair forward from workspace-aware code. |
| Workflow cancelled or Cloudflare unavailable | Check live state when access returns. Reapply maintenance before further data changes. |
| Database restore proposed | Ask Chinh separately and identify writes that would be lost. |

Record the release commit, Worker version, Pages deployment, backup bookmark and verification results in the private release record.
Keep the reviewed workspace-aware commit available for recovery. Never deploy the old global-access application over migrated data.
D1 Time Travel does not restore R2. This cutover changes ownership metadata, not R2 objects.
Keeping a bookmark file does not extend D1's restore window: 7 days on Free or 30 days on Paid.

## Local verification and remaining limits

Local verification passed on 10 September 2026:

- 691 frontend tests across 74 files, 164 Worker tests across 15 files, and 375 integration tests across 22 files
- 10 release-script tests, including workflow ordering and operator argument guards
- production frontend build, Worker dry run using `wrangler.production.toml`, actionlint and `git diff --check`
- disposable operator lifecycle: private inventory, premature readiness rejection, apply, successful readiness and repeat-write rejection
- persisted pending status, empty programmes, active VIP programmes, unequal content ownership and null-ownership rejection

The 13 cutover integration tests also verify exact mappings and atomic rollback of all constraints and the completion marker.
The initial inline rehearsal harness hung before binding acquisition; running the normal script file completed without that failure.
All rehearsal proxies exited. Temporary harness and disposable database were removed; existing QA servers were left running.
Logs and synthetic inventory remain privately under `.amp/in/workspace-stage-3/`.
Tests reported React `act` warnings, and the build reported large chunks; neither failed its check.

Local checks cannot verify Cloudflare credentials, domain attachment, remote proxy access or an actual GitHub deployment.
Those checks remain part of the separately approved production release.
