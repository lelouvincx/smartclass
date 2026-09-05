---
rfc: RFC-13
title: Sectioned exercise numbering
date: 2026-09-05
status: Accepted
dependencies: [RFC-2, RFC-4, RFC-11]
---

# RFC: Sectioned exercise numbering

## Trigger

The first local PDF acceptance set uses Vietnamese exam numbering that restarts in each section. For example, both `Phần I` and `Phần II` contain `Câu 1`. RFC-11 assumed that the printed question number was also the globally unique grading and navigation ID, so valid source documents failed with “Question 1 has more than one marker.”

## Decision

SmartClass separates internal question order from the number printed in the source document.

- `q_id` remains a globally unique integer. Grading, answer storage, image assets, and Previous or Next navigation continue to use it.
- `section_key` is the stable source-section identity.
- `section_title` is the optional heading shown to teachers and students.
- `local_number` is the question number printed within that section.

For an exercise without sections, SmartClass uses `section_key = "main"`, `section_title = null`, and `local_number = q_id`. This keeps existing exercises and API clients compatible.

```diagram
Printed source                  SmartClass identity
┌──────────────────────┐       ┌────────────────────────────────┐
│ Phần I · Câu 1       │──────▶│ q_id 1 · section-1 · number 1 │
│ Phần I · Câu 2       │──────▶│ q_id 2 · section-1 · number 2 │
│ Phần II · Câu 1      │──────▶│ q_id 3 · section-2 · number 1 │
└──────────────────────┘       └────────────────────────────────┘
```

This RFC supersedes RFC-11 only where RFC-11 treats expected question IDs and printed marker numbers as the same value. RFC-11 remains authoritative for question assets, answer candidates, teacher confirmation, atomic activation, and submission pinning. RFC-2 remains authoritative for grading by `q_id`.

## Detection and parsing

The Exercise PDF detector keeps ordered section state across page boundaries. It maps each `(section_key, local_number)` marker to one global `q_id` from the proposed schema. A local number may repeat in another section, but cannot repeat within the same section.

Sectioned Vietnamese markers require punctuation after the number, such as `Câu 1.`. This prevents compact answer-table headings such as `Câu 1 Câu 2` from becoming duplicate question starts. The existing broader marker behavior remains available for unsectioned legacy documents.

The Answer PDF parser returns the same descriptors with every schema row. SmartClass rejects responses that:

- omit or duplicate a global `q_id`
- change the expected section or local number
- use inconsistent titles for one section key
- omit a required boolean part or return parts outside `a` to `d`

## Persistence and activation

Both the current `answer_schemas` rows and the pinned `exercise_question_answer_schemas` rows store the 3 source descriptors. Creating a pending question asset set snapshots the current descriptor and type shape atomically.

Uploads and answer candidates must refer to a global `q_id` in that pinned shape. Activation may change final answers, but it must not change `q_id`, section descriptors, sub-question keys, or answer types. One D1 batch rechecks the shape, confirms the set, updates pinned answers, replaces the current schema, and changes the active pointer.

## Interface behavior

Teachers review the detected source section and can correct its local number before preparing an asset set. The global `q_id` stays internal.

Student answer sheets group questions by section and show local numbers. Accessible labels include both the section title and local number. Question headings use the same source-facing identity. Previous and Next still follow global `q_id` order, including transitions between sections.

## Invariants

- every schema has one ordered, globally unique `q_id` per question
- every `(section_key, local_number)` identifies only one question within an exercise
- all rows of one boolean question share the same source descriptor
- one section key has one section title within a schema
- a pending asset set keeps the descriptor and type shape it had at creation
- a submission keeps the descriptors from its pinned answer-schema snapshot
- grading and stored student answers continue to use `q_id`

## Acceptance criteria

- sectioned PDFs can restart numbering without duplicate-marker failures
- section state continues across PDF pages
- compact Answer PDF tables do not create extra question starts
- legacy unsectioned schemas normalize without manual migration work
- teacher creation, editing, preparation, and activation preserve descriptors
- student take and review screens group and label questions by source section
- question navigation and grading behavior remain unchanged
