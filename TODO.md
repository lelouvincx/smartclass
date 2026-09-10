# Todo

This file tracks planned work. See [`PRODUCT.md`](PRODUCT.md) for shipped product truth and [`CHANGELOG.md`](CHANGELOG.md) for completed changes.

Priorities apply within each version:

- **P0:** required to ship the version
- **P1:** important and expected in the version
- **P2:** optional; defer before delaying the version

## v0.6: Guest mode and launch readiness

### Separate maths and English workspaces

Follow [RFC-17: teaching workspaces](docs/plans/RFC-17-2026-09-09-teaching-workspaces.md) for the access rules, migration stages and acceptance tests.

- [ ] **P0** Make prepared workspace ownership and membership storage authoritative at access cutover, including required content ownership
- [ ] **P0** Approve the [workspace release window](docs/plans/RFC-17-stage-3-release.md), verify API domains and Google settings, and record the reviewed release commit and D1 restore bookmark
- [ ] **P0** Run the approved migration and verify isolated access on `toanthaythanh.com` and `tienganhcothuy.com`
- [ ] **P1** Remove unmounted legacy routes and global teaching-access fields after stabilization and update product and schema documentation

**Outcome:** students share credentials, each teacher manages one workspace, and Chinh administers both.

### Guest access and operations

- [ ] **P0** Let guests browse exercises without logging in and save exercise results in IndexedDB
- [ ] **P0** Add structured production logging and monitoring
- [ ] **P1** Plan guest exercise mode: design IndexedDB storage, route access, and a data model for anonymous exercise completion
- [ ] **P1** Prompt guests to register after engagement
- [ ] **P1** Add a cost analysis and estimation dashboard

**Outcome:** anonymous users can try a reliable, production-ready platform before registering.

## v0.7: Assessment depth

- [ ] **P0** Add an explanation field to each answer, supporting images and Markdown with math notation
- [ ] **P1** Improve Cohere student-photo extraction with orientation and perspective correction, then benchmark consented real photos
- [ ] **P1** Let students scan an exercise-sheet QR code to open a submission form pre-filled with the exercise and signed-in student
  - [ ] **P1** Generate a QR code for each exercise
- [ ] **P2** Remove the deprecated `exercises.extract_model` column after the Cohere Worker is deployed

**Outcome:** students get richer answer guidance, retain each allowed attempt, and can move efficiently from printed exercises to online submission.

## v0.8: Account management

- [ ] **P0** Add a forgot-password flow
- [ ] **P1** Let students change their own passwords, and let teachers reset student passwords
- [ ] **P1** Add the remaining user profile fields: class, social links, profile image, and email

**Outcome:** students and teachers can recover and manage complete accounts without administrator intervention.

## v0.9: Teacher insights

- [ ] **P0** Let teachers view student lists with exercises taken, average score, and last active time
- [ ] **P1** Let teachers view individual student profiles with submission history and performance trends

**Outcome:** teachers can identify participation and performance trends at class and student level.
