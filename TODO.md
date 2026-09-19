# Todo

This file tracks planned work. See [`PRODUCT.md`](PRODUCT.md) for shipped product truth and [`CHANGELOG.md`](CHANGELOG.md) for completed changes.

Priorities apply within each version:

- **P0:** required to ship the version
- **P1:** important and expected in the version
- **P2:** optional; defer before delaying the version

Work in version order, then priority order. Release safety and account access come before learning enhancements; optional convenience and legacy cleanup must not delay them.

## v0.6: Launch readiness

Follow the [coordinated cutover runbook](docs/plans/RFC-18-production-cutover.md), which supersedes workspace-only reopening. Use [RFC-17](docs/plans/RFC-17-2026-09-09-teaching-workspaces.md) and [RFC-18](docs/plans/RFC-18-2026-09-13-curriculum-and-content-access.md) for access rules and acceptance tests.

The 14 September release record shows that workspace and curriculum cutover, completion gates, Pages deployment and API reopening completed. Do not repeat completed backfills. Guest mode has no remaining implementation tasks here; shipped behavior belongs in `PRODUCT.md` and `CHANGELOG.md`.

- [ ] **P0** Complete authenticated post-cutover production acceptance
  - [ ] **P0** Obtain approval for production actors and any production test writes
  - [ ] **P0** Verify Google origins, callbacks and teacher routing
  - [ ] **P0** Verify Guest, student, teacher and platform-administrator workspace isolation on both sites
  - [ ] **P0** Verify an existing pinned attempt and current new-attempt access, or record an approved omission
  - [ ] **P0** Record the tested commit, time, actors, evidence and omissions privately
- [ ] **P2** Remove unmounted legacy routes and global teaching-access fields after stabilization
- [ ] **P2** Enrich the [Vietnamese teacher manual](docs/lecture-manual.vi.md) with screenshots of verified teacher workflows

**Outcome:** the release record is accurate, and approved authenticated acceptance verifies workspace isolation, curriculum access and pinned attempts before v0.6 closes.

## v0.7: Account recovery and assessment depth

- [ ] **P0** Choose the account-ownership recovery method and implement forgot-password
  - Prerequisite: choose verified email, SMS, or Google-linked sign-in plus assisted recovery; define recovery for accounts without a Google link
  - Prerequisite: if email or SMS is chosen, implement delivery and contact verification before recovery. An editable profile email is not proof of ownership
  - Prerequisite: if assisted recovery is required, promote teacher-managed resets below to P0
  - Acceptance: expire codes or links, enforce single use, limit attempts, throttle requests, and avoid revealing whether an account exists
  - Acceptance: invalidate pre-existing sessions across both workspaces after recovery or reset. Apply the same protection to student and existing teacher password changes; define whether the initiating session is replaced or signed out
- [ ] **P0** Implement student profile editing with class, social links, profile image, and email
  - Prerequisite: define whether class means school class, a workspace teaching group, or existing programme membership
  - Acceptance: specify shared versus workspace-specific fields and who can view or edit each field, including teachers across workspaces; deny unrelated students access
  - Acceptance: keep profile email separate from login and verified recovery identity unless explicitly approved
  - Acceptance: give profile images a dedicated storage namespace, enforce file type and size limits, and authorize uploads, replacements and reads without using public exercise-asset access
- [ ] **P1** Let students change their own passwords after verifying their current password
- [ ] **P1** Let teachers reset student passwords with verified ownership checks and safeguards for accounts shared across workspaces
  - Acceptance: define which teacher can reset a shared identity and how the student receives recovery access; enforce the recovery abuse controls and session invalidation above
- [ ] **P1** Add student-facing answer explanations after submission, supporting images and Markdown with math notation
  - Acceptance: assess reuse of existing teacher-only answer-detail images without automatically making them student-visible
  - Acceptance: gate explanations with answer visibility on authenticated routes; explicitly decide Guest exposure and whether historical attempts retain pinned explanations or show later edits
- [ ] **P2** Generate a QR code for each exercise and let signed-in students scan it to open that exercise's submission flow

**Outcome:** students can recover access, maintain their profiles, get richer answer guidance and move from printed exercises to online submission.

## v0.8: Teacher insights

- [ ] **P0** Let teachers view student lists with exercises taken, average score, and last active time
  - Prerequisite: define last active as submission activity or tracked workspace use. If tracking is chosen, schedule capture in v0.7 before the insights release and state its history limits
  - Acceptance: scope all metrics to the current workspace; do not expose activity from another workspace
- [ ] **P1** Add a teacher view of student performance with submission history and trends, separate from editable personal profile fields

**Outcome:** teachers can identify participation and performance trends at class and student level.

## v0.9: Maintenance

- [ ] **P2** Remove the deprecated `exercises.extract_model` column after verifying the deployed Worker and supported recovery code no longer use it

**Outcome:** obsolete schema is removed safely.
