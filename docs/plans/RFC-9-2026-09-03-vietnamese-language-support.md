---
rfc: RFC-9
title: Vietnamese Language Support
date: 2026-09-03
status: Accepted
dependencies: [RFC-6, RFC-8]
---

# RFC: Vietnamese Language Support

## Summary

SmartClass will support English and Vietnamese throughout the authenticated teacher and student application. English remains the default. Users can select a language in Settings, and the browser stores that preference locally.

Login, registration, and API-originated messages remain English. SmartClass will not infer language from the browser, and this release does not add account-level language storage.

## Goals

- Translate first-party authenticated UI copy into formal, neutral Vietnamese.
- Let a signed-in user switch between English and Vietnamese without reloading.
- Persist the choice in `localStorage` on the current browser.
- Localize first-party dates, relative times, durations, numbers, counts, validation, status, toast, and accessibility text.
- Preserve current assessment, authorization, and data behavior.

## Non-goals

- Translating login or registration.
- Translating API response messages or changing the Worker API.
- Translating teacher-authored titles, sections, exercise content, uploaded files, model names, phone formats, email addresses, or the SmartClass name.
- Synchronizing language preferences across browsers or devices.
- Automatically selecting a language from browser settings.
- Adding languages other than English and Vietnamese.

## Decisions

### Locale selection and persistence

- Supported locale identifiers are `en` and `vi`.
- English is always the initial fallback when no valid saved preference exists.
- The selector lives in Settings because language is an explicit user preference.
- The preference uses a versioned local-storage key so a future storage contract can migrate deliberately.
- Changing the setting updates the application immediately and sets the document `lang` attribute.

### Copy style

Vietnamese copy uses formal, neutral wording:

- Prefer concise, direct instructions and labels.
- Avoid casual language, gendered wording, and unnecessary pronouns.
- Use the same term for the same product concept in visible and assistive text.
- Preserve truthful state distinctions such as unanswered versus skipped and in-progress versus submitted.

The implementation includes an English–Vietnamese terminology glossary. Oracle reviews the complete glossary and translated copy after the first full draft; concrete findings are resolved before final verification.

#### Approved terminology glossary

| English concept | Vietnamese term |
| --- | --- |
| Exercise | Bài tập |
| Attempt | Lượt làm bài |
| Submission | Bài nộp |
| Answer sheet | Phiếu trả lời |
| Answer key | Đáp án |
| Answer or solution file | PDF đáp án |
| Timed | Có giới hạn thời gian |
| Untimed | Không giới hạn thời gian |
| Unanswered while working | Chưa trả lời |
| Empty after submission | Bỏ trống |
| Correct | Đúng |
| Incorrect | Sai |

`Đáp án đúng` identifies the correct value for an individual question or table column; `Đáp án` identifies the answer key as a whole. Oracle approved this glossary and the formal, neutral Vietnamese copy after reviewing the complete resource set.

### Formatting

Locale controls presentation, not timezone. Dates and times continue to use the browser's timezone. Shared `Intl` formatters replace hard-coded `en-US`, hard-coded `vi-VN`, and implicit locale formatting in authenticated UI.

### API boundary

API error and success messages remain server-owned English. Frontend-owned validation, fallback, toast, and status messages are localized. This release makes no Worker or database changes.

### Technical approach

- Use `i18next` with `react-i18next` and statically bundled English and Vietnamese resources.
- Organize semantic keys by `common`, `settings`, `teacher`, and `student` concepts.
- Use interpolation and pluralization instead of constructing translated sentences from fragments.
- Keep a generic English fallback for missing translation keys and verify locale key parity in tests.

## Delivery plan

1. Add localization initialization, persistence, document-language synchronization, shared formatting helpers, and Settings selection.
2. Translate shared authenticated shell, navigation, theme controls, accessibility labels, statuses, dialogs, and reusable assessment components.
3. Translate teacher flows: dashboard, students, exercises, exercise creation/editing, and lectures.
4. Translate student flows: dashboard, exercises, landing, take experience, image extraction, history, summary, and review.
5. Review terminology and complete copy with Oracle, then resolve findings.
6. Run focused localization tests, all frontend and Worker suites, integration tests, and the production build. Manually verify desktop and 390px layouts in both languages.

## Acceptance criteria

- Settings offers English and Tiếng Việt and applies changes immediately.
- Reloading the same browser preserves a valid selection; absent or invalid values fall back to English.
- Authenticated first-party UI and accessibility text are complete in both languages.
- Login, registration, and API-originated messages remain English by design.
- Dates, relative times, durations, numbers, and counts follow the selected locale without forcing a timezone.
- English and Vietnamese resource trees have matching keys.
- No Worker, API contract, or database behavior changes.
