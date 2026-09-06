---
rfc: RFC-15
title: Teacher-assigned programme access and lecture tiers
date: 2026-09-06
status: Accepted
dependencies: [RFC-10]
---

# RFC: Teacher-assigned programme access and lecture tiers

## Trigger

Two students can belong to the same programme but need different lecture access. Programme membership alone cannot express that distinction.

Teachers also need to publish selected lectures to visitors who do not have an account. Public access must not let a signed-in student see less than the same person could see after signing out.

## Decision

SmartClass separates the programme a student studies from the level of lecture content they can watch.

Teachers assign each student one or more programmes: Grade 10, Grade 11, Grade 12, and ĐGNL. Teachers also assign each authenticated student one account tier: Standard or VIP. Students do not subscribe to or change either value themselves.

Each lecture keeps its programme assignments and gains one minimum access tier: Guest, Standard, or VIP. Tiers are ordered:

```text
Guest < Standard < VIP
```

VIP students inherit Standard access. Standard and VIP students inherit Guest access. SmartClass does not persist Guest student accounts; Guest is the effective tier for a request without credentials.

## Scope

This decision applies tiers only to lectures. Exercises, submissions, question assets, and exercise files continue to use programme overlap without a tier check.

Payments, renewals, expiry dates, student-managed subscriptions, per-student lecture exceptions, and digital rights management are outside this RFC.

## Access policy

For a non-teacher, a lecture is available when:

```text
visible
AND (
  minimum tier is Guest
  OR (
    caller is an active authenticated student
    AND a student programme overlaps a lecture programme
    AND the student's tier meets the lecture minimum
  )
)
```

A Guest lecture is public regardless of its programme assignments. This ensures that signing in never removes access to a public lecture.

Standard and VIP lectures require an active student account and programme overlap. Tier or programme changes take effect on the next request because lecture authorization reads current account data from D1 instead of storing the tier in JWT claims.

Teachers bypass visibility, programme, and tier checks for administration and preview.

A request with no `Authorization` header is a Guest request. A malformed, invalid, or expired credential returns `401`; it never falls back to Guest. A pending or disabled account cannot use authenticated lecture access.

## Data model

Keep the existing storage and API contract:

- `student_grades`, `exercise_grades`, and `lecture_grades` tables
- `grades` API property
- values `10`, `11`, `12`, and `"dgnl"`

The interface and product documentation call these values programmes. Renaming the storage contract is separate work.

Add the student tier to `users`:

```sql
access_tier TEXT NOT NULL DEFAULT 'standard'
  CHECK (access_tier IN ('standard', 'vip'))
```

Add the lecture minimum tier:

```sql
minimum_access_tier TEXT NOT NULL DEFAULT 'standard'
  CHECK (minimum_access_tier IN ('guest', 'standard', 'vip'))
```

Existing students and lectures become Standard. This preserves existing authenticated access and does not publish existing lectures.

## API behavior

Teacher student-list responses include `access_tier`. Teacher-created students accept `standard` or `vip` and default to Standard when omitted.

`PUT /api/users/grades` remains the programme replacement operation. `PUT /api/users/access-tier` replaces the tier for one or more students. The tier operation validates every target before updating any row. Programme and tier updates are independent.

Lecture create, update, and teacher-list responses include `minimum_access_tier`. Create defaults it to Standard. Update omission preserves the current value, including during visibility-only updates.

`GET /api/lectures` accepts an absent credential and returns only lectures that the caller can open. Its response uses `Cache-Control: private, no-store` because the result depends on authorization. The existing player resolves a lecture from this filtered list, so the list is also the player authorization boundary. A future detail endpoint must apply the same policy.

## Interface behavior

Student administration uses separate controls for programmes and account tier. Student rows show both. Bulk programme and bulk tier actions remain separate so one action cannot silently replace the other value.

Lecture administration uses separate programme and minimum-tier controls. The curriculum shows both assignments.

Public `/lectures` and `/lectures/:lectureSlug` routes sit outside the authenticated route guard. Guest playback uses a privacy-enhanced YouTube embed but does not read or write account-scoped playback progress.

## Verification

Tests cover:

- migration defaults and constraints
- student tier creation, validation, listing, and bulk replacement
- independence of programme and tier updates
- Guest, Standard, VIP, visibility, and programme combinations
- current D1 status and tier taking effect without a new token
- invalid credentials returning `401`
- teacher controls and tier labels
- public lecture browsing and account-free playback

Run frontend, Worker unit, integration, and production build checks. Inspect the affected teacher and public routes at desktop, mobile, narrow portrait, and short landscape sizes in light and dark themes.

## Acceptance criteria

- Teachers can assign any supported programme combination and Standard or VIP tier to a student.
- Teachers can assign programmes and one minimum tier to each lecture.
- Every visible Guest lecture is available to anonymous, Standard, and VIP viewers regardless of programme.
- Visible Standard lectures require a matching Standard or VIP student.
- Visible VIP lectures require a matching VIP student.
- Hidden lectures remain unavailable to students and visitors.
- Teachers can manage and preview every lecture.
- Missing credentials mean Guest; invalid credentials return `401`.
- Existing students and lectures migrate to Standard without changing programme assignments or visibility.
- Exercise authorization remains programme-based and unchanged.

## Risks

Public YouTube URLs can be shared outside SmartClass. Tier checks protect SmartClass routes, not playback on YouTube.

Tier must remain separate from programme membership. Treating VIP as another programme would incorrectly produce OR semantics instead of requiring both programme overlap and sufficient tier.
