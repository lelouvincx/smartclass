---
rfc: RFC-18
title: Curriculum navigator and independent programme and tier access
date: 2026-09-13
status: Implemented and deployed; authenticated production acceptance pending
dependencies: [RFC-10, RFC-12, RFC-15, RFC-17]
---

# Curriculum navigator and content access

Chinh approved this model and UI direction B on 13 September 2026. The model is implemented and deployed. See [PRODUCT.md](../../PRODUCT.md) for shipped product behavior, the [Vietnamese manual](../lecture-manual.vi.md) for teacher guidance, and [TODO.md](../../TODO.md) for remaining acceptance work.

## Why the model must change

The client needs to assign Khối 10, Khối 11, Khối 12, THPT and ĐGNL independently. A student may study Khối 12 and THPT without ĐGNL. “VIP1” and “VIP2” were suggestions for expressing those choices, not a need for more tiers.

Production inspection on 13 September found 6 lectures. One sat under “Lớp 12”, had a Khối 10 access badge, and encoded Chương, Bài and Tiết in its title. Free-text grouping cannot reliably describe curriculum structure. Repeated management controls also crowd the mobile list.

The existing product has 4 programmes and lecture tiers. THPT, structured placements and exercise tiers are additions.

## Separate what students study from their access level

Three concepts answer different questions:

| Concept | Question | Rule |
| --- | --- | --- |
| Programme | What does the student study? | Assign any combination of Khối 10, Khối 11, Khối 12, THPT and ĐGNL |
| Tier | What level of content can they access? | Assign one student tier: Standard or VIP |
| Placement | Where does a video belong? | Place the same video in one or more lessons |

Programme and tier belong to the student's workspace membership. Neither grants the other: VIP does not grant all programmes, and Khối 12 does not grant THPT. Keep programme and tier updates separate. No VIP1, VIP2 or SVIP is needed.

Each video and exercise has one minimum tier: Guest < Standard < VIP. Guest means public access, not a stored student account type.

## Store a video once and place it where needed

Use Programme → Topic → Lesson → Unit:

**Chương trình → Chuyên đề → Bài → Tiết**

Chuyên đề is the sole official Vietnamese label for Topic in all 5 programmes. Historical titles containing Chương remain subject to migration review.

Each topic belongs to one programme; each lesson belongs to one topic. Each unit is a placement in a lesson, referencing one shared video.

| Shared video owns | Placement owns |
| --- | --- |
| Title, YouTube URL, minimum tier, visibility | Parent lesson and order within that lesson |

Consequences:

- editing or hiding a video affects every placement
- removing one placement leaves other placements intact; removing a programme's last placement revokes its restricted access, so show that audience change before confirmation
- deleting a video requires confirmation listing all affected placements
- unplaced videos are teacher-only, including Guest videos
- playback resume follows student and video identity, not placement; replacing the YouTube video retains the existing reset behavior

Derive a video's programmes from its placements. A separate editable access-programme list would recreate the current contradiction. Exercises keep directly assigned programmes and do not require curriculum placements. Shared topics, shared lessons and cross-workspace videos are outside scope.

## Require both programme overlap and sufficient tier

First enforce workspace ownership, visibility or publication readiness, and credential validity. Then apply this rule to non-teachers:

```text
minimum tier is Guest
OR (
  student membership is active and approved
  AND student and content share at least one programme
  AND student tier >= content minimum tier
)
```

Guest content is public regardless of programme. Missing credentials permit Guest access; invalid credentials do not fall back to Guest. Blocked accounts receive the existing access error. Authenticated non-managers with missing, pending or disabled memberships also receive their membership error, even for Guest content. They are not silently treated as anonymous visitors.

For visible, ready content:

| Student | Content | Result |
| --- | --- | --- |
| Khối 12, Standard | Khối 12, Standard | Allow |
| Khối 12, Standard | Khối 12, VIP | Deny: tier |
| Khối 12, VIP | THPT only, Standard | Deny: programme |
| Khối 12 + THPT, VIP | THPT, VIP | Allow |
| Khối 11 + ĐGNL, VIP | Shared Khối 12 / ĐGNL video, VIP | Allow via ĐGNL |
| No credentials | Placed Guest lecture | Allow |

Access through one placement does not grant access to other restricted curricula. Filter navigation and previous/next links within the viewer's authorized placement context. Public navigation includes only public content.

Apply the same policy to lists, direct URLs, playback data, exercise starts and protected assets. Read current membership and tier on requests. Preserve started attempts, pinned content and historical results when access changes.

Teachers can manage and preview content only in their authorized workspace; administrators select a workspace explicitly. Teacher previews do not write student progress. Guest access never exposes hidden videos or teacher-only answers. SmartClass checks cannot prevent sharing public YouTube URLs outside the app.

Exercise tiers extend the entitlement model only. Guest exercise browsing, anonymous attempts and result storage require their separate design before release.

## Use direction B to separate navigation from work

On desktop, show programme choices above 2 panes: topics and lessons on the left, the selected lesson's ordered units on the right. Show its title and breadcrumb. Keep “Thêm tiết”, edit and preview easy to find; put secondary actions in labelled menus. Adding a unit offers a new video or an existing workspace video.

On mobile, show navigation first, then the selected lesson. A return control preserves programme, expanded topic and position. All teacher actions remain available. Students use the same hierarchy without management controls or restricted titles. Managers see empty parents; students see a neutral empty state based only on authorized results and their own membership, never hidden counts.

Student forms separate “Chương trình được học” from “Gói truy cập” and summarize the resulting access before saving. Video forms separate placement, “Ai được xem” (Công khai / Tiêu chuẩn / VIP), and “Hiển thị”. Show affected locations and audience changes before changing shared access or visibility.

Keep the existing design system and dedicated player route. Direction B is a composition choice, not a new visual identity or a pixel specification.

### Reorder interaction

Ordering answers “What comes next?” Moving answers “Where does this belong?” Keep them separate because moving can change access; ordering cannot.

Use Material 3's [real-time drag feedback](https://m3.material.io/foundations/interaction/gestures) and [labelled, keyboard-accessible list actions](https://m3.material.io/components/lists/accessibility). The editing mode and save policy below are SmartClass choices, not a prescribed Material component.

1. Select “Sắp xếp chuyên đề”, “Sắp xếp bài” or “Sắp xếp tiết” for one parent. Open its complete sibling list in the right pane, or full content area on mobile. Include labelled hidden items, collapse descendants and explain the disabled action when fewer than 2 items exist. Programme order stays Khối 10, Khối 11, Khối 12, THPT, ĐGNL.
2. Drag a row by its 48 × 48px Material Symbols handle, or use labelled move-up/down buttons. The row body remains scrollable. Show the lifted row, placeholder and insertion indicator; move neighbors in real time and auto-scroll near list edges. Respect reduced motion. Canceling a drag restores its pre-drag position.
3. Keep button operation available to touch, keyboard and assistive technology. Disable unavailable boundary moves, retain focus on the moved item and announce its new position. Use normal button activation, not undocumented arrow-key shortcuts.
4. Review the local draft, then choose “Lưu thứ tự” or “Hủy”. Keep both controls reachable without covering content. Save is enabled only after a change; Cancel discards it. Leaving an unsaved draft requires a discard decision.
5. Save the complete order atomically and prevent duplicate submissions. Success returns to the navigator with selection preserved and a confirmation. Failure retains the draft for retry. Reject stale saves and offer reload rather than overwriting another teacher's changes.

Number siblings within their parent. Moving a topic or lesson preserves its children; ordering units changes only their placement ordinals. It does not rewrite video titles or other placements.

Use “Chuyển đến…” for a cross-parent move, showing source, destination and any audience change before confirmation. Cross-parent dragging is outside reorder mode. “Dùng video đã có” adds a placement; “Chuyển đến…” relocates one.

## Migrate without unapproved access changes

Review a mapping from existing sections, titles and programmes to the new hierarchy. Conflicting production labels make automatic title-based classification unsafe.

Preserve IDs, links where feasible, URLs, visibility, tiers and playback identity. Preserve effective programme access unless a per-video change is explicitly approved. Create multiple placements where needed; do not grant THPT automatically.

Defaulting existing exercises to Standard is the proposed migration choice: preserve current student access without publishing exercises. Confirm the active workspace schema before choosing storage or endpoints. Use atomic D1 batches for related writes and retain a rollback path. This RFC does not authorize production changes.

On implementation, this replaces [RFC-10's flat lecture order](RFC-10-2026-09-03-lecture-experience.md) and extends [the programme-and-tier RFC-15](RFC-15-2026-09-06-programme-and-tier-access.md). Preserve [RFC-12's resume contract](RFC-12-2026-09-04-local-lecture-playback-resume.md) and [RFC-17's workspace boundaries](RFC-17-2026-09-09-teaching-workspaces.md).

## Verify the boundaries, not just the happy path

Write failing tests before changing behavior. Cover:

- programme mismatch despite a higher tier, insufficient tier despite programme overlap, and public access without credentials
- hidden content, invalid credentials, foreign-workspace IDs and protected answers across lists, direct routes and assets
- shared edits affecting every placement, while removal and ordering affect only the selected placement
- equivalent drag and button ordering, boundaries, hidden siblings, focus announcements, Cancel, retry, atomic saves and stale-save rejection
- current access changes without login renewal, preserved attempts and migration without unapproved audience changes

Apply the complete [frontend acceptance contract](../../DESIGN.md#frontend-acceptance), including empty and error states, long names, multiple placements and reorder mode. Run the required frontend, Worker, integration and build checks before an application PR.

## Implementation plan

Storage, backfill, curriculum APIs, exercise-tier enforcement and maths THPT support are implemented and deployed. Programme controls, the direction B navigator and contextual player use the new APIs. Local automated and rendered acceptance passed; PR #135 records the evidence and coverage limits. The [coordinated release runbook](RFC-18-production-cutover.md) records the production cutover and remaining authenticated acceptance boundary.

`worker/index.js` mounts `workspace-curriculum.js` and `curriculum-lectures.js` alongside the updated UI. Mounted-route tests cover public placed content, manager navigation and contextual playback. Exercise-tier changes use the mounted `workspace-*` routes. Production cutover completed on 14 September 2026; authenticated production permission checks remain pending.

### Extend storage without replacing video identity

| Storage | Change |
| --- | --- |
| `lectures` | Keep IDs and shared video fields; retire `section_name`, global `order_index` and `lecture_grades` after cutover |
| `curriculum_topics` | Add ID, workspace, programme, title and sibling `order_index` |
| `curriculum_lessons` | Add ID, workspace, topic, title and sibling `order_index` |
| `lecture_placements` | Add ID, workspace, lesson, lecture and sibling `order_index`; require a unique lesson/lecture pair |
| `workspaces` | Add integer `curriculum_revision`, initially zero |
| `exercises` | Add `minimum_access_tier`, default Standard |

Use positive integer IDs, non-empty titles and non-negative order indices. Keep positions contiguous after writes; sort by position then ID. Use non-unique sibling-position indexes so swaps do not cause transient uniqueness failures. Composite foreign keys reference unique `(id, workspace_id)` parent keys and enforce same-workspace ownership. Use RESTRICT for non-empty topic/lesson deletion and CASCADE from videos to placements. Update `docs/schema.dbml` with each migration.

Keep the existing `grades` API property. Use `[10, 11, 12, 'thpt', 'dgnl']` as the canonical maths order in both frontend and Worker code. Rebuild the active membership and exercise grade constraints, preserving rows and indexes. Existing “all programmes” assignments remain their explicit 4 values; adding THPT grants nobody access automatically. Do not rename the grade contract or change English programme choices in this work.

Migration `0026_add_thpt_programmes.sql` implements the active membership and exercise constraints. Mounted registration, joining, student management and exercise APIs validate programmes against the workspace. English retains `[10, 11, 12, 'dgnl']`. Legacy `student_grades` and `lecture_grades` remain unchanged. Local tests compare membership and exercise grants before and after migration, then verify explicit THPT assignment separately.

### Use one curriculum revision for safe edits

Every curriculum mutation, including creation of unplaced videos, increments the workspace revision. Requests carry `expected_revision`; stale writes return `409 CURRICULUM_CHANGED`.

Start the D1 batch with a conditional revision increment. Immediately follow it with a constraint-failing assertion when `changes() <> 1`, before any content writes. This follows the rollback-guard pattern in `workspace-exercises.js`: a zero-row update alone does not abort a batch. A failed assertion rolls back the whole mutation. Translate only the known guard failure to a conflict, confirming the current revision; propagate unrelated database errors rather than calling every failure a stale edit.

One workspace revision may reject an unrelated concurrent edit. Accept that small inconvenience rather than introducing several versioning schemes. Test a stale revision with the same sibling IDs in a different order, and a stale revision after insertion or deletion. Neither may partially write.

### Keep APIs resource-oriented

All paths below are under `/api`. Use existing workspace middleware, `jsonSuccess` / `jsonError`, and frontend `request()`.

| Endpoint | Contract |
| --- | --- |
| `GET /curriculum?programme=…` | Return ordered topics and lessons with accessible unit counts; managers also receive the revision and empty parents |
| `GET /curriculum/lessons/:id` | Return breadcrumb and ordered units, each with placement ID and shared video data |
| `POST /curriculum/{topics,lessons,placements}` | Create with explicit parent; placement accepts an existing lecture ID or a new video, atomically |
| `PUT /curriculum/{topics,lessons,placements}/:id` | Rename or move as applicable; reject foreign-workspace parents |
| `DELETE /curriculum/{topics,lessons,placements}/:id` | Remove the named resource under the deletion rules above |
| `PUT /curriculum/order` | Accept `parent_type`, `parent_id`, complete `ids`, and `expected_revision`; require each sibling exactly once |
| `GET /lectures/:id?placement=…` | Return authorized video, resolved placement, breadcrumb and previous/next units |
| `GET /lectures` and shared-video writes | Management-only reusable-video search and CRUD; programme assignments become derived, read-only data |

Braces above denote 3 separate resource paths. `parent_type` is `programme`, `topic` or `lesson`; `parent_id` is its programme value or numeric ID. Workspace identity comes from middleware. All curriculum and shared-video mutations require management rights and the revision; return the new revision after success. Non-managers receive only accessible rows, counts and ancestors. Return `404` for inaccessible curriculum/video IDs; preserve authentication errors and existing exercise `403` behavior. Use private, no-store responses for audience-dependent reads.

Validate parent and video ownership before writes and enforce it in the transaction. Missing or foreign-workspace references return `404`; duplicate lesson/video placements, including moves, return `409 PLACEMENT_EXISTS`. Foreign keys remain a backstop, not the source of user-facing `500` errors.

At cutover, player and non-manager list pages stop calling `listLectures`: use curriculum reads and the authorized detail endpoint instead. This prevents unplaced Guest videos leaking through the former public flat list. Retire `PUT /lectures/order` and reject obsolete section/programme writes with a reload-required error. Retain legacy storage for verification, not as a second writable source of truth.

### Preserve links and make sequence contextual

Keep the current audience-prefixed `/lectures/:id-:slug` paths. Add `?placement=<id>` to player links and `?programme=…&lesson=…` to list routes. Breadcrumbs return ancestor IDs as well as labels. IDs identify content; titles remain descriptive. Restore browser Back and refresh from authorized URL state, not component memory alone.

The API validates that the placement references this video and is accessible. For absent, invalid, removed or inaccessible context, select the first authorized placement in fixed programme order, then topic, lesson and unit order. Replace the URL without adding browser history; disclose no rejected context. If the video has no accessible placement, return not found. A manager may preview an unplaced video without curriculum navigation.

Previous/next traverse the selected programme in teaching order, crossing lesson and topic boundaries and skipping inaccessible units. They never cross into another programme. Back returns to the resolved lesson. Keep resume keys unchanged: account, workspace, lecture and YouTube video IDs. Test a shared video with different neighbors in 2 programmes.

### Add exercise tiers without revoking attempts

Release Standard/VIP exercise selection first. Reserve Guest in storage, but reject new Guest exercise assignments until public exercise routes are ready. Default existing exercises to Standard. Keep guest browsing and anonymous attempts in the separate guest-exercise plan.

Add the tier predicate to lists, detail, active PDFs, question images, new-attempt insertion and its failure-diagnostic query. Preserve `has_grade_access` as programme overlap; add `has_tier_access` and require both in `can_start_attempt`. Update detail/file denial branches and return `403 TIER_ACCESS_DENIED` for insufficient tier. Test that denial never becomes a misleading `409 ATTEMPT_STATE_CHANGED` reload loop.

Keep the existing owned-attempt exceptions. A downgrade can block a new attempt, but an active member can resume their started attempt and view their pinned results and assets. Account blocks and disabled membership still deny access. Submission-scoped downloads retain their protections; the general file route must not grant historical access to a newer PDF. Test an exercise upgraded to VIP after a Standard student starts it.

When current access is denied, an in-progress attempt's exercise landing page must return its pinned question set, not replacement question metadata. The local regression tests cover an exercise upgraded to VIP with a new question set, and a tier change immediately before attempt insertion.

### Prepare a reviewed migration, not guessed categories

The [maths migration-review table](RFC-18-migration-review.vi.md) records Chinh's approved placements for 6 maths videos. Video 2 retains both Khối 12 and ĐGNL. The [English review](RFC-18-English-migration-review.vi.md) adds 6 English videos under Chuyên đề 1: Verb tenses → Bài 1: Verb tenses, in all 4 existing English programmes. Both mappings preserve source identity, programmes, tiers and visibility. Together they create 9 topics, 9 lessons and 31 placements. The 14 September production cutover ran live source validation before application.

Migration `0024_add_curriculum.sql` adds storage without switching reads. In [curriculum-backfill.js](../../worker/db/curriculum-backfill.js), `validateCurriculumBackfill(db, mapping)` returns a read-only audience comparison. Supply both executable mappings as `{ workspaces: [mathsMapping, englishMapping] }`. Validation requires complete source coverage, verified workspace cutover, empty target curricula and revision zero in each target workspace. `backfillCurriculum(db, mapping)` revalidates and writes both hierarchies and one completion marker in one batch. The caller must keep writes frozen across validation, application and checks. The [curriculum operator](../../scripts/curriculum-release.mjs) exposes inspect, validate, apply and check commands. Remote operation requires the full deployed commit and verified maintenance; writes also require explicit confirmation. No application route invokes backfill.

Create a mapping keyed by workspace and lecture ID, with target programme, topic, lesson and order. Snapshot original titles, tiers, visibility and programme sets. Validate complete mappings and parents; emit each video's before/after programme diff. Every non-empty diff needs `approved_audience_change` recording the exact old/new sets and reviewer name. Reject unapproved narrowing as well as expansion. Default-all assignments may need deliberate narrowing; do not infer how many production rows need it. Preserve original relative order unless reviewed otherwise.

Chinh resolved the conflicting Khối 10/Lớp 12 example in favor of Khối 10. Missing mappings block cutover; they do not create public placeholders or silently hide videos. During the cutover, the operator rehearsed on disposable data and ran a fresh read-only production comparison before applying the mapping.

The production cutover depended on verified RFC-17 Stage 3 completion and non-null workspace ownership. Local work used a completed workspace fixture. Additive storage deployed without changing reads. Inside the cutover maintenance window, the operator froze writes and compared the fresh source snapshot and audience diffs with the approved mapping immediately before applying it. The RFC itself did not authorize production operations.

Switch API and UI together after validation. Preserve old tables for verification, but do not roll back to old ordering after new edits without reconciliation or a reviewed restore. Remove legacy fields in a later cleanup.

### Keep the remaining work bounded

Remaining priorities live in [TODO.md](../../TODO.md#v06-launch-readiness). Authenticated production acceptance must verify real account permissions, Google routing and configuration, programme-and-tier access, and pinned attempts before v0.6 closes.

Chinh or the teacher reviewed the migration map and any changed audience before cutover. The agent owned schema/API details, tests, local migration rehearsal and UI verification. Authenticated production acceptance remains a separate approval.

Payments, renewals, expiry, per-student content exceptions and per-placement tiers remain outside scope.
