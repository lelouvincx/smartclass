---
rfc: RFC-17
title: Separate teaching workspaces with shared accounts
date: 2026-09-09
status: Proposed
dependencies: [RFC-1, RFC-7, RFC-10, RFC-15]
---

# Separate teaching workspaces with shared accounts

## The result we want

Run 2 teaching sites with one application and one backend:

| Site | Subject | Teacher |
| --- | --- | --- |
| `toanthaythanh.com` | Maths | Thầy Thành |
| `tienganhcothuy.com` | English | Cô Thuỳ |

A workspace is one teaching site's content, students and access settings.
A user is one person's shared account and profile, identified internally by a stable user ID.
A phone number and password are current login details, not the definition of a user.
The [v0.8 account roadmap](../../TODO.md#v08-account-management) adds class, social links, a profile image and email.
A membership connects that person to a workspace.

For example, Mai can use the same password on both sites.
Mai signs in separately on each site.
Thầy Thành can give Mai VIP maths access.
Cô Thuỳ can give Mai Standard English access.
Removing Mai's maths access does not remove her English access.

Chinh has a new role: platform administrator.
Chinh can manage both workspaces, but works in one workspace at a time.

This document is a plan, not shipped behaviour.
[PRODUCT.md](../../PRODUCT.md) remains the source for current behaviour.
[TODO.md](../../TODO.md) holds the implementation checklist under v0.6.
In this document, RFC-15 means the [programme and tier RFC](RFC-15-2026-09-06-programme-and-tier-access.md), not the Cohere RFC.

## What Chinh has decided

- use `tienganhcothuy.com` as the English domain
- share login credentials across both sites
- keep separate browser sign-ins; single sign-on is a deferred nice-to-have
- automatically send teachers who sign in on the wrong site to their teaching workspace's domain
- control teaching access through workspace membership
- give Chinh a new administrator role covering both workspaces
- keep existing students with no programmes pending in maths; require programme assignment before approval

The remaining design choices below are recommended defaults.
They can change before implementation without changing these decisions.

## What production contains today

Read-only checks on 9 September 2026 found:

| Area | Observation |
| --- | --- |
| Frontend | One Pages project connects `toanthaythanh.com` and `tienganhcothuy.com` |
| Backend | One `smartclass-api` Worker, one D1 database and one R2 bucket |
| Teachers | Chinh, user 1; Thầy Thành, user 5; Cô Thuỳ, user 22 |
| Students | 14 active and 8 pending |
| Exercises | 2, both created by Thầy Thành |
| Lectures | 5, created by Chinh or Thầy Thành |
| Attempts | 9, including 7 completed |

The production version endpoint matched the local checkout:
[`63d8448`](https://github.com/lelouvincx/smartclass/commit/63d8448415b9aa2fd3ff4a6370576cd4646773b6).
Wrangler deployment inspection and D1 queries confirmed the bindings, schema and counts.
These are a dated snapshot. Refresh them before migration.

On 10 September 2026, `tienganhcothuy.com` resolved through DNS and returned HTTP 200 over HTTPS.
Chinh confirmed this existing domain is the English site. No frontend domain replacement or redirect is needed.

Today, teacher rights are global. The API does not separate either domain's data.
The `created_by` field records authorship, not who can access a record.
Student approval, programme access and VIP tier also apply globally.

Registration does not record the originating site.
We cannot safely infer whether each existing student intended to join maths or English.

## Give each role clear limits

| Action | Platform administrator | Teacher | Student |
| --- | --- | --- | --- |
| Manage teaching content | Either workspace, selected explicitly | Own workspace | No |
| Approve, disable, restore or change a student's workspace membership | Selected workspace | Own workspace | No |
| View completed student attempts | Selected workspace | Own workspace | Own attempts in current workspace |
| Inspect another person's unfinished answers | No | No | No |
| Disable or restore a shared account everywhere | Yes | No | No |
| Change platform roles | Controlled operator procedure only | No | No |
| Edit own shared profile | Yes | Yes | Yes |

Teachers can disable or restore a student's membership in their own workspace.
For example, Thầy Thành can stop Mai's maths access and restore it later. Her English access stays unchanged.
Only a platform administrator can block or restore Mai's shared account across both sites.
A teacher cannot override that global block by restoring a workspace membership.

Store `platform_admin` separately from membership roles.
Membership roles are `teacher` and `student`.
This prevents a maths teacher role from granting English teaching rights.

The API checks administrator rights explicitly.
Do not silently turn an administrator into a teacher or treat every non-teacher as a student.
Use named permission checks for teaching management and student attempts.
Administrators can preview content but cannot create student attempts unless separately enrolled as students.

The first release includes a small administrator area on each site.
It identifies the current workspace and provides controls to disable or restore a shared account everywhere.
That action requires explicit confirmation and explains that both sites lose access.
Select targets from the current workspace's membership list, not an unscoped directory of users.
These controls cannot disable administrator accounts. Use the reviewed operator procedure for administrator account changes.
Restoring a shared account preserves each membership's status, tier and programmes.
Teachers continue to see workspace-only account controls.
Log administrator actions with actor, workspace, target, action and outcome, without credentials or answers.

Create Chinh's administrator grant through a reviewed deployment procedure.
Confirm the account using a stable identifier before granting access.
Do not promote an account based only on its name or a hardcoded ID in a generic migration.
Before enabling the role, Chinh must manually replace the production account's default password through Settings.
Chinh must confirm a fresh sign-in works with the new password. Record completion only, never the password.
This manual prerequisite needs no new password-change feature or password reset in the migration.
Provide no role-promotion or workspace-creation interface in this release.

## Keep identity separate from teaching access

| Data | Where it belongs | Rule |
| --- | --- | --- |
| Phone, password, linked Google identity, name | User | Shared across sites |
| Global account block | User | Administrator-controlled; blocks both sites |
| Teacher or student role | Membership | Applies to one workspace |
| Pending, active or disabled status | Membership | Applies to one workspace |
| Standard or VIP tier | Membership | Applies to that workspace's lectures |
| Programme memberships | Membership | Grade 10, 11, 12 or ĐGNL access in that workspace |
| Teacher-assigned student name | Membership | Local display-name override; does not rename the shared identity |
| Domain, title and subject | Workspace configuration | Selects the site and its labels |
| Exercises and lectures | Workspace | Each record belongs to exactly one workspace |
| Attempts, answer sets and files | Owning exercise | Inherit its workspace |

Keep phone numbers globally unique after normalization.
Keep Google identity links globally unique.
Changing a password or Google link changes the shared identity, not one membership.
Password recovery and new student password-change features remain separate roadmap work.

Future personal profile fields belong to the shared user unless they describe a workspace-specific relationship.
Adding an email profile field does not automatically make email a login method.
Define the roadmap's class field before implementation: a school class differs from a teaching group or programme membership.
Keep account relationships attached to the stable user ID when login details or profile fields change.

Use the local display name when a teacher views student lists or attempts.
Otherwise, use the shared profile name.
Use separate labels for editing a shared profile and editing a workspace display name.

### Proposed storage changes

- add `workspaces`, with stable IDs, unique slugs, display names and subject codes
- add `workspace_memberships`, unique on `(workspace_id, user_id)`
- add membership programme rows, unique on `(membership_id, grade)`
- add a global `platform_role` and `disabled_at` to users
- add required `workspace_id` ownership to exercises and lectures
- add indexes for workspace content lists, lecture ordering and membership lookups

Each membership stores its role, status, tier, optional display name and timestamps.
Constrain these values to the choices defined above and use foreign keys for ownership links.
The global platform role is `user` by default or `platform_admin` after an explicit grant.
A null `disabled_at` means the shared identity is enabled.

Keep legacy user role, status, tier and programme columns during the migration preparation stage.
The new application must have one authority for each value: membership data replaces the legacy teaching fields at cutover.
Remove legacy fields in a later cleanup migration after the new release is stable.

Keep child records linked through existing exercise and answer-set relationships.
Validate that source files, active sets, answer assets and submissions belong to the same exercise.
Add database constraints where practical and integration tests for every remaining API-enforced relationship.
R2 key prefixes are not authorization checks. Keep existing keys to preserve pinned attempts.

## Make login and joining different actions

Login proves who the person is. Joining requests access to the current workspace.
Login alone must never create a membership.

| Situation | Result |
| --- | --- |
| New person registers | Create identity and pending student membership atomically |
| Existing person registers again | Ask them to sign in with their existing credentials; change nothing |
| Student signs in on their second site | Sign in successfully; show a join screen if membership is absent |
| Teacher signs in on the wrong site | Verify identity, then redirect to their active teaching workspace's domain |
| Signed-in person requests to join | Create one pending membership with requested programmes and Standard tier |
| Pending member signs in | Show approval status; deny teaching content |
| Disabled member signs in | Show disabled membership status; deny teaching content |
| Globally disabled person signs in | Deny login and invalidate use of existing sessions on both sites |
| Teacher creates a genuinely new student | Create shared identity and active membership in the current workspace |
| Teacher enters an existing phone number | Create nothing; tell the student to sign in and request membership |

For an existing phone, preserve the current `409 PHONE_EXISTS` response with clearer guidance.
Never reset its password, overwrite its name or attach it to a workspace through unauthenticated registration.
A duplicate or concurrent join request must not reset approval, tier or programmes.
A disabled membership cannot rejoin to bypass teacher approval.

Approval and reactivation require at least one programme in the current membership.
Reject activation without programmes through either the approval or status endpoint.
Assigning programmes does not approve a membership; approval remains a separate teacher action.

Retain the current new-student password policy for ordinary teacher-created accounts in this release.
Show a default password only when the API actually created a new identity.
Strengthening that policy is separate from workspace separation.

### Send teachers to their teaching site

After verifying credentials, resolve the teacher's active teaching memberships from D1.
Apply the same routing decision after phone login, linked Google login and authenticated session restoration.

| Person and starting site | Destination |
| --- | --- |
| Cô Thuỳ signs in on `toanthaythanh.com` | `tienganhcothuy.com` |
| Thầy Thành signs in on `tienganhcothuy.com` | `toanthaythanh.com` |
| Teacher signs in on their teaching site | Stay on that site |
| Chinh signs in on either site | Stay on that site as platform administrator |

Redirect before showing a student join screen or teaching-management pages on the wrong site.
Use only a canonical destination from the server's workspace configuration, never a caller-supplied redirect URL.
Do not reveal teaching memberships before successful authentication or grant teaching access on the starting site.
A global account block takes precedence over routing. A disabled teaching membership is not an eligible destination.
If no active teaching membership exists, show membership status rather than redirecting to a disabled workspace.
If a teacher later teaches in multiple workspaces, stay when the current workspace is one of them.
Otherwise, let the teacher choose an active teaching workspace rather than guessing or creating a redirect loop.

This is navigation, not single sign-on.
The destination uses its own valid session if one exists; otherwise, it asks the teacher to sign in again.
Do not transfer passwords, access tokens or Google callback codes between sites.
The destination rechecks identity and membership before opening its teacher workspace.

### Separate identity checks from membership checks

Use an identity-only guard for profile, current-account, Google-link and join operations.
Use an active-membership guard for student learning routes.
Use a teaching-management guard for teachers in the current workspace or a platform administrator.

Return the current workspace, platform role and membership separately from `/api/auth/me`.
A missing membership must never enter a route that assumes the caller is a student.
Identity-only users can read join status but cannot list students, submit work or fetch protected files.

Use the same checks for phone login and linked Google login.
Validate Google callback URLs against the current site's exact configured callback URL.
Keep Google state, nonce and PKCE checks. A callback from the other workspace must fail.

## Make each domain select one workspace

Use an explicit environment-specific map:

| Frontend host | API host | Workspace |
| --- | --- | --- |
| `toanthaythanh.com` | `api.toanthaythanh.com` | Maths |
| `tienganhcothuy.com` | `api.tienganhcothuy.com` | English |

Configure both API hosts to route to the same Worker.
The English API hostname is planned configuration, not established by the frontend DNS check.
The Worker resolves workspace from its request URL hostname, not a body field or a caller-provided workspace header.
Unknown hosts fail closed, including the default Worker hostname for product routes.
Health and version endpoints may remain public and workspace-neutral.
Configure explicit local and test hosts for both workspaces.

The frontend uses the exact host map, including its upload-progress XHR paths.
An unknown frontend host shows an unsupported-site message instead of falling back to maths.
Use an explicit preview mapping; a Pages preview must not silently select production maths.

Allow CORS only for the matching frontend origin on each API host.
Reject mismatched browser origins before product handlers run.
A request without Origin still needs all normal token and permission checks.
CORS is a browser rule, not proof of access.

Issue tokens containing the user ID, workspace ID, issue time and expiry.
Reject old tokens without a workspace ID and tokens issued for another workspace.
Read global status, administrator role and membership from D1 on each protected request.
Never trust a cached token role after an administrator changes access.

Each browser origin stores its own session.
Students reuse credentials but sign in separately on each site.
Do not move tokens between domains through URLs, redirects or browser storage bridges.
Namespace local playback and future guest storage by workspace and user where applicable.

## Scope every content and account operation

Apply workspace ownership before existing programme, tier, visibility and answer-disclosure rules.
Return `404` for a resource ID belonging to another workspace.
For bulk operations, reject the entire request if any target is outside the current workspace.
Use `DB.batch()` for changes that must succeed together.

| Code area | Required change |
| --- | --- |
| `worker/index.js` | Resolve workspace before route handlers; enforce host and CORS map |
| `worker/lib/auth.js`, `worker/middleware/auth.js` | Workspace tokens and separate identity, learning and management guards |
| `worker/routes/auth.js` | Shared identity, join lifecycle and site-specific Google callbacks |
| `worker/routes/users.js` | Membership student lists, approval, status, local names, programmes and tiers |
| `worker/routes/exercises.js` | Scope lists, details, creation, updates and deletion |
| `worker/routes/lectures.js` | Scope guest lists, teaching controls, maximum order and complete reorder validation |
| `worker/routes/submissions.js` | Scope history, starts, completed reviews and pinned downloads |
| Upload, files and question-asset routes | Resolve and authorize the owning exercise before reading or writing R2 |
| `src/lib/api.js` | Resolve API host for fetch and XHR |
| `src/lib/auth-context.jsx`, router and route guards | Represent identity without membership; handle administrator permissions |
| App shell, login, registration and Settings | Show site identity, join status and shared-profile scope |
| Student administration | Distinguish local access changes from administrator-only global blocks |

Preserve existing attempt rules:

- programme changes alone do not break pinned attempts or completed reviews
- disabled memberships cannot access attempts until reactivated
- attempts remain stored when membership access is removed
- history is visible only in its owning workspace
- teachers and administrators cannot inspect another person's unfinished answers

Guest lectures remain public within the selected workspace, regardless of programme.
Invalid credentials must return an error rather than silently becoming a guest request.
Retain private, no-store caching for identity-dependent responses.
Any future shared cache must include workspace and access policy in its cache key.

## Deliver the change in 5 stages

### Stage 1: Confirm the migration inputs

Read the [Stage 1 evidence and route inventory](RFC-17-stage-1-evidence.md) before continuing.
Research and a synthetic local export/import rehearsal are complete.
Chinh approved maths for all current content and students, confirmed user 1, and completed the manual password prerequisite.
Chinh approved keeping the 4 students with missing programmes pending, with their programme sets empty.
Stage 1 is complete. Refresh the mapping before production migration to account for later registrations.

Agent actions:

1. Refresh production counts, teacher identifiers, schema and domain configuration using read-only checks.
2. Prepare an explicit mapping for existing content and memberships.
3. Identify every current API route and record its required permission and workspace lookup.
4. Record a tested backup and restore procedure without exporting credentials into the repository.

Chinh actions:

1. Confirm that both existing exercises and all 5 lectures belong to maths.
2. Confirm which students belong to maths, English or both, including pending students.
3. Confirm Chinh's administrator account.
4. Complete the manual password change and fresh sign-in described under [role limits](#give-each-role-clear-limits).

Done when: every existing content record and account has a reviewed destination, and Chinh confirms the password prerequisite is complete.
Unresolved student attribution blocks the production migration, not local development.
Store student-specific evidence privately; keep names and phone lists out of the public repository.

Preserve existing status, programmes and tier in the reviewed original membership.
Preserve empty programmes for the 4 pending students. Do not assign a default or approve them during migration.
Existing disabled status means membership-disabled, not globally blocked, unless Chinh explicitly identifies a global block.
For an additional membership, record its status, programmes and tier explicitly rather than copying VIP access automatically.
Never create an additional active membership merely to preserve a historical attempt.
Keep the attempt and resolve its access policy through the reviewed membership mapping.

### Stage 2: Build and test locally

Status on 10 September: complete locally. Stage 3 preparation has started separately.
Final checks passed: 687 frontend tests, 161 Worker unit tests, 362 integration tests and the production build.
Browser checks covered both sites, account and membership rules, teacher routing, student submissions and teacher content changes.
The redirect loop and 3 narrow-screen layout defects found during those checks are fixed and rechecked.
All QA browsers are closed. Local servers were restarted for Chinh's manual QA and remain running.
The later [persisted end-to-end run](../../tests/e2e/teaching-workspaces/README.md) passed all 7 scenarios; temporary lecture fixtures were removed.
See the [verification and coverage limits](RFC-17-stage-1-evidence.md#stage-2-route-coverage) before preparing a release.
No production migration, deployment or administrator grant has run.

The database preparation uses migration `0023_add_teaching_workspaces.sql`.
It adds storage and the 2 workspace records, without assigning accounts, promoting administrators or changing application permissions.
Content ownership remains nullable during preparation so the existing application can still write.
Require non-null ownership when the workspace-aware application takes over.

The separate `backfillWorkspaces(db, mapping)` operation lives in `worker/db/workspace-backfill.js`.
No application route or automatic migration calls this operation.
Its reviewed mapping lists every user, exercise and lecture exactly once:

- users include `id`, `platform_role` and explicit `memberships`
- memberships include `workspace_id`, `role`, `status`, `access_tier`, `grades` and nullable `display_name`
- exercises and lectures include `id` and `workspace_id`

The operation rejects incomplete mappings, changed original student access and already-migrated state before writing.
It copies the supplied mapping before database reads and applies writes in one D1 batch.
Keep application maintenance enabled throughout validation, writes and postchecks, with no competing deployment or writer.
A failed postcheck does not undo a committed batch. Keep access closed and investigate before recovery.
Production invocation and the administrator grant remain subject to Stage 4 approval and the password prerequisite.

The workspace application uses these authentication boundaries:

- `worker/lib/workspaces.js` holds exact production, local and test site maps
- `requireWorkspace` resolves the API URL and checks the matching browser origin
- `requireWorkspaceIdentity` loads shared identity and current membership using a workspace-bound token
- `requireWorkspaceStudent` and `requireWorkspaceManagement` check permissions after identity verification
- `getTeacherRouting` returns a canonical destination decision; the frontend must still perform navigation

Middleware order is workspace, identity, then the route's permission check.
Context stores `workspace`, shared `authUser`, `workspaceMembership` and `teacherRouting` separately.
The shared identity has no legacy teaching role or status.
Local maths uses frontend port 5173 and API port 8787; English uses ports 5174 and 8788.
Unknown environments and unconfigured preview sites have no mapping.
`worker/index.js` now mounts only workspace-aware product routes.
Existing regression tests call that entry point with explicit test hosts and workspace fixtures.
Production still runs the previous application until the controlled release in Stages 3 and 4.

The account routers use the same boundary:

- `worker/routes/workspace-auth.js` handles shared login, registration, profile, Google links and explicit workspace joining
- `worker/routes/workspace-users.js` manages current-workspace student memberships and administrator-only global blocks

Login and Google login return `{ token, user, workspace, membership, teacher_routing }` inside `data`.
Current-account and profile responses omit `token`.
The new `POST /api/auth/join` creates a pending membership; repeated requests preserve existing membership settings.
The new `PUT /api/users/:id/global-status` accepts `{ disabled: boolean }` and targets a current-workspace student membership.
The combined account test checks registration, separate sign-ins, joining, programme assignment, approval and independent disabling.
Real-application tests also reject old tokens and cross-site tokens, and apply live membership changes and global blocks.

All exercise, question-set, submission, lecture and file routes now enforce workspace ownership.
Their scope tests use the assembled application entry point.
See [Stage 2 route coverage](RFC-17-stage-1-evidence.md#stage-2-route-coverage) for the test map and verification limits.
Original route files remain unmounted reference code during the staged change; they are not a rollback option.

Agent actions:

1. Write failing integration tests for the permission matrix before changing behaviour.
2. Add schema, membership migration logic and workspace configuration.
3. Implement identity, membership and administrator checks.
4. Scope every route from the Stage 1 inventory.
5. Add the join screens, workspace labels and administrator controls.
6. Test migration against synthetic accounts representing the production mapping.

Done when: the acceptance cases below pass, and every route has a recorded scope test.
Keep the shared design system and language controls. English subject does not force English interface language.
Follow [DESIGN.md](../../DESIGN.md#frontend-acceptance) for all interface work and evidence.

### Stage 3: Prepare a controlled release

Read the [Stage 3 release runbook](RFC-17-stage-3-release.md) for local preparation, verification and remaining approvals.
On 10 September Chinh chose application maintenance in the existing deployment workflow instead of an independent Cloudflare gate.
The local workflow now deploys maintenance before migration and requires completed cutover before reopening.
Neither the live workflow nor production has changed yet.

Agent actions:

1. Split harmless schema preparation from the membership backfill and access cutover.
2. Test application maintenance, allowing only GET health and version before database access.
3. Put maintenance verification and a D1 restore bookmark before schema migration in the existing workflow.
4. Rehearse the separate operator and ownership constraints against disposable data.
5. Prepare the English API domain, bindings, CORS and Google callback settings for approval.
6. Document recovery using workspace-aware code with maintenance enabled.

Done when: local checks pass and the runbook names commands, owners, checks and failure actions.
Application maintenance does not survive deploying old code. This accepted limitation replaces the earlier independent-gate requirement.
Record exact release versions when publication is approved. A first automatic run stops closed until backfill is complete.

### Stage 4: Migrate and open both sites

These production actions require separate approval. This plan does not authorize them.

Agent actions after approval:

1. Run the reviewed workflow to deploy maintenance, verify both API hosts, record the D1 bookmark and prepare schema.
2. Confirm existing requests and competing writers have stopped before taking the final inventory.
3. Review and apply the complete mapping through the separate operator while maintenance remains enabled.
4. Preserve all identity IDs, hashes, Google links, exercise IDs, attempts, scores and R2 keys.
5. Validate exact assignments and foreign keys, then atomically install ownership constraints and the completion marker.
6. Rerun the reviewed workflow to check readiness, deploy the frontend and reopen both APIs.
7. Check both frontend versions, old-token rejection and the approved administrator grant.
8. Run production permission checks only with explicitly approved test accounts and writes.
9. Restore maintenance if a release or isolation check fails.

Done when: maths and English pass isolated guest, student, teacher and administrator checks.
Expect one fresh sign-in on each site after cutover.
Do not treat a successful HTTP response or deployment alone as proof of isolation.

### Stage 5: Stabilize and remove legacy fields

Agent actions:

1. Review errors and denied-access logs for each workspace during approved post-release checks.
2. Fix access defects before adding new features.
3. Remove obsolete role, status, tier and programme storage after confirming there are no legacy consumers.
4. Update product truth and schema documentation to match shipped behaviour.

Done when: both sites pass the same permission tests after cleanup and no code reads legacy authorization fields.
Schedule ongoing monitoring only if Chinh requests it.

### If the release fails

Keep or restore application maintenance before recovery and verify its live state.
After workspace data is introduced, never serve it with the old single-workspace application.
Use reviewed workspace-aware code or repair the current build while maintenance remains enabled.
Retain the new database schema during an application rollback unless a reviewed recovery procedure requires otherwise.

A full database restore can discard new work.
It needs explicit approval and an account of writes made after the restore point.
Restoring old data and code also restores the old global-access behaviour, so do not reopen English under that state.

## Tests that prove the separation

Use unequal fixtures: a maths-only teacher, an English-only teacher, a platform administrator,
a maths-only student and a student with different tiers and programmes in each workspace.
Give both workspaces content and overlapping programme labels.

| Case | Required result |
| --- | --- |
| Maths token reaches English API | `401`; no content returned or changed |
| Old token has no workspace | `401`; user must sign in again |
| Unknown host or mismatched browser origin | Rejected before product operations |
| Cô Thuỳ signs in on maths, or Thầy Thành signs in on English | Redirect to the configured teaching site; no wrong-workspace access or join prompt |
| Redirect destination has no valid session | Ask for sign-in there; transfer no credentials or tokens |
| Teacher signs in on the correct site, or Chinh signs in on either site | Stay on that site; no redirect loop |
| Wrong-site Google login or session restoration succeeds | Apply the same teacher routing without forwarding Google callback codes |
| Teacher has no active teaching membership, or identity is globally blocked | No redirect to a disabled teaching workspace; show status or deny login |
| Caller supplies an external redirect destination | Ignore or reject it; use only configured workspace destinations |
| English teacher uses maths exercise, file, answer-set or attempt IDs | `404`; no metadata, bytes or writes |
| Mixed-workspace bulk update or lecture reorder | Entire operation rejected; neither workspace changes |
| Guest opens each site | Only that workspace's visible Guest lectures appear |
| Same student has VIP maths and Standard English | Each site applies its own tier and programmes |
| Maths teacher disables that student | Maths stops immediately; English remains available |
| Administrator globally blocks that identity | Existing sessions on both sites stop immediately |
| Administrator restores that identity | Each workspace retains its previous membership status and access settings |
| Administrator tries to block an administrator account through the interface or API | Denied; administrator access remains available |
| Teacher attempts a global block or role change | Denied; global user data unchanged |
| Valid identity has no membership | Join screen works; learning and management routes deny access |
| Pending or disabled member calls learning API directly | Denied without falling into a student branch |
| Teacher approves or reactivates a membership without programmes | `400 PROGRAMMES_REQUIRED`; status stays unchanged, including through the status endpoint |
| Teacher assigns programmes to a pending membership | Membership stays pending until a separate approval succeeds |
| Repeated or concurrent join requests | One membership; existing state unchanged |
| Registration or teacher creation uses an existing phone | Credentials, shared name and memberships unchanged |
| Teacher renames a student | Only current workspace display name changes |
| Student lists attempts on English site | No maths attempts appear, even with the same user ID |
| Programme changes after an attempt starts | Pinned attempt remains usable in its original workspace |
| Teacher or administrator requests unfinished student answers | Denied |
| Google login uses the other site's callback | Rejected; no session or membership created |
| Source file or answer set belongs to another exercise | Activation or upload rejected, even within one workspace |
| Old frontend calls the old maths API after cutover | Old token rejected; wrong-site origin rejected; no English session accepted |
| Migration runs on representative data | Reviewed membership totals; IDs, files, hashes, links, answers and scores unchanged |
| Application rollback rehearsed | Maintenance stays closed or workspace checks remain enforced |

Run `npm test`, `npm run test:worker`, `npm run test:integration` and `npm run build` before an application PR.
Inspect the affected screens at the sizes and themes required by DESIGN.md.
Include join, pending, disabled, teacher and administrator states.
Store visual evidence under `.amp/in/artifacts/` and inspect each submitted capture.

## What we are leaving out

- single sign-on across domains, deferred as a nice-to-have
- a workspace creation or role-promotion interface
- payments, subscriptions and membership expiry
- cross-workspace reports or content sharing
- new English question types, audio exercises or marking rules
- automatic student membership assignment from a matching phone number

These features can follow after workspace separation works.
The first release keeps one Worker, one D1 database, one R2 bucket and one frontend build.
The main cost is checking ownership on every operation, not running another backend.

## Oracle review and choices retained

Oracle reviewed the proposed model against current code on 9 September 2026.

We adopted separate identity and membership guards, direct-ID isolation tests, local student names,
workspace lecture ordering and protection against unsafe application rollback.

Oracle recommended postponing a new administrator role.
We retained it because Chinh requested that distinction.
The global account-block action gives this role an explicit responsibility beyond teaching.
That action is a recommended scope choice, not a separately confirmed user requirement.

We did not adopt inferred maths attribution or a calculated API hostname for arbitrary frontend hosts.
Use the reviewed mapping and explicit host map instead.
Chinh later accepted a brief frontend/backend mismatch and application maintenance in the existing workflow.
The [release runbook](RFC-17-stage-3-release.md) records that choice and its rollback limitation.
