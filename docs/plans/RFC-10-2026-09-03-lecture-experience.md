---
rfc: RFC-10
title: Lecture Experience
date: 2026-09-03
status: Accepted
dependencies: [RFC-1, RFC-8, RFC-9]
---

# RFC: Lecture Experience

## Summary

SmartClass will give teachers an ordered curriculum editor for YouTube lectures and give students a sectioned curriculum with a dedicated video player. The experience follows the same calm, readable hierarchy as the assessment product and supports English and Vietnamese.

Lectures require an authenticated teacher or student account. Guest lecture access remains roadmap work.

## Goals

- Let teachers create, edit, order, preview, and delete lectures.
- Organize lectures into consecutive named sections that preserve the teacher's global ordering.
- Help students scan the curriculum and open a dedicated lesson page.
- Embed YouTube videos with privacy-enhanced URLs while retaining a direct YouTube fallback.
- Give every student lecture page a readable, collision-safe URL.
- Keep the experience usable at desktop and 390px mobile widths.

## Non-goals

- Tracking lesson completion, watch progress, or resume position.
- Uploading or hosting video files.
- Nested sections, section descriptions, thumbnails, transcripts, or attachments.
- Guest lecture access.
- Drag-and-drop ordering.

## Approved experience

### Teacher curriculum

`/teacher/lectures` mirrors the student's curriculum structure so teachers can understand the result while editing it.

- Group consecutive lectures under section headers without globally merging repeated section names.
- Number lectures according to their global order.
- Keep add, move up, move down, edit, and delete actions explicit and touch-accessible.
- Let a teacher expand a lecture's embedded video directly in the curriculum. Only one embedded player is open at a time.
- Use an add/edit dialog with one vertical column in this order: Section, Lecture title, YouTube URL.
- Make every input span the dialog width. Existing section names are offered as suggestions, while new names remain valid.
- Saving makes the lecture immediately available to students.

### Student curriculum

`/student/lectures` presents the course as a sectioned, ordered outline rather than a gallery of independent cards.

- Show section headings, lesson counts, global lecture numbers, and full lecture titles.
- Make each lecture row a single clear link to its player page.
- Provide loading, retry, and empty states.

### Student player

`/student/lectures/:lectureSlug` is a dedicated lesson page.

- Show a Back to Lectures action, section name, lecture title, responsive 16:9 player, and direct YouTube fallback.
- Do not show a redundant `Lecture N of M` label.
- Show previous and next lecture cards below the player. Previous content is left-aligned; next content is right-aligned.
- Use a privacy-enhanced `youtube-nocookie.com` embed and preserve fullscreen support.

## URL decision

Student lecture URLs use `<id>-<title-slug>`, for example:

`/student/lectures/5-understanding-linear-equations`

The numeric ID remains the lookup key and prevents collisions between lectures with the same title. The title portion is normalized to lowercase ASCII kebab case, including Vietnamese diacritic removal. This does not require a database migration or a separately editable slug field.

## Data and API

The existing `lectures` table remains the source of truth: `id`, `title`, `section_name`, `youtube_url`, `order_index`, creator, and timestamps. No schema change is required.

The existing lecture API remains responsible for listing and teacher-authorized create, update, reorder, and delete operations. Reordering the global lecture list also determines section runs.

## Implementation plan

1. Add shared lecture helpers for consecutive section grouping, privacy-enhanced YouTube embeds, slugged paths, and URL ID parsing.
2. Build the student curriculum route and add it to student navigation and dashboard actions.
3. Build the dedicated student player with responsive embed, fallback link, focus and document-title handling, and previous/next navigation.
4. Redesign the teacher lecture page around the shared sectioned curriculum, one-column add/edit dialog, inline embed, and existing CRUD/reorder API operations.
5. Add matching English and Vietnamese copy, including visible and assistive labels.
6. Update `PRODUCT.md` and the README roadmap when the feature ships so lectures are no longer described as roadmap-only.
7. Run focused lecture tests, all frontend and Worker suites, integration tests, and the production build. Manually verify teacher and student flows at desktop and 390px mobile widths.

## Acceptance criteria

- Teachers can create, edit, reorder, preview, and delete lectures without leaving the curriculum page.
- The create/edit dialog is single-column with Section first and full-width fields.
- Students see the same global order grouped into consecutive sections.
- Every student lecture link and previous/next link uses `<id>-<title-slug>`.
- The player shows the section and title without a redundant global-count label.
- YouTube embeds use the privacy-enhanced domain and retain a direct fallback link.
- Empty, loading, failure, invalid-link, and missing-lecture states are truthful and recoverable.
- Teacher-only mutations remain enforced by the API.
- English and Vietnamese resource trees remain in parity.
- Relevant tests, full required checks, and desktop/mobile visual review pass before shipping.
