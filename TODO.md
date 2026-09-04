# Todo

This file tracks planned work. See [`PRODUCT.md`](PRODUCT.md) for shipped product truth and [`CHANGELOG.md`](CHANGELOG.md) for completed changes.

Priorities apply within each version:

- **P0:** required to ship the version
- **P1:** important and expected in the version
- **P2:** optional; defer before delaying the version

## v0.5: Lectures

- [ ] **P1** Plan guest mode: design IndexedDB storage, guest route access, and a data model for anonymous exercise completion

**Outcome:** a complete learning experience with exercises and video lectures.

## v0.6: Guest mode and launch readiness

- [ ] **P0** Let guests browse exercises and lectures without logging in and save exercise results in IndexedDB
- [ ] **P0** Polish the interface and mobile experience
- [ ] **P0** Add structured production logging and monitoring
- [ ] **P1** Prompt guests to register after engagement
- [ ] **P1** Buy and configure the production domain
- [ ] **P1** Add a cost analysis and estimation dashboard

**Outcome:** anonymous users can try a reliable, production-ready platform before registering.

## v0.7: Assessment depth

- [ ] **P0** Add an explanation field to each answer, supporting images and Markdown with math notation
- [ ] **P1** Improve the extraction LLM prompt
- [ ] **P1** Let students scan an exercise-sheet QR code to open a submission form pre-filled with the exercise and signed-in student
  - [ ] **P1** Generate a QR code for each exercise

**Outcome:** students get richer answer guidance and can move efficiently from printed exercises to online submission.

## v0.8: Account management

- [ ] **P0** Add a forgot-password flow
- [ ] **P1** Let students change their own passwords, and let teachers reset student passwords
- [ ] **P1** Add user profile fields: name, class or grade, social links, profile image, and email

**Outcome:** students and teachers can recover and manage complete accounts without administrator intervention.

## v0.9: Teacher insights

- [ ] **P0** Let teachers view student lists with exercises taken, average score, and last active time
- [ ] **P1** Let teachers view individual student profiles with submission history and performance trends

**Outcome:** teachers can identify participation and performance trends at class and student level.
