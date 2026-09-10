# Learning and content browser run on 10 September 2026

WS-01, WS-06 and WS-07 passed through the real local interface. The additional sidebar relocation checks also passed.
Maths submission 4 scored 5/10. English submission 5 scored 10/10. Both completed attempts remain as evidence.
Exercise 2002 and the original Maths lecture order are restored. Both temporary lectures are deleted. All owned browsers are verified closed.

## Scope and actors

This run tested the shared working tree, including uncommitted Stage 2 code, rather than `origin/main`.
It used Maths at `http://localhost:5173` and English at `http://localhost:5174`, with their existing isolated QA emulators.
The fixture manifest was `.amp/in/e2e-workspaces-fixtures.json`. No fixture reset, server change, production operation or full test suite ran.

| Actor | Use | Access at start |
| --- | --- | --- |
| Anonymous visitor | Guest lecture lists on both sites | No browser sign-in |
| Learner 208, `+84900000182` | WS-01 and WS-06 | Active Maths grade 12 VIP; active English grade 10 Standard; no attempts |
| Maths teacher, `+84865481769` | WS-07 | Maths teaching management |

The browser entered the synthetic credentials through sign-in forms. No tokens or cookies were exported.
The learner signed out of Maths before the teacher signed in. English remained in a separate origin tab.
Other students, teacher profiles and membership access settings were not changed.

## WS-01 passed with separate sign-ins and access

Scenario: [shared credentials](../teaching-workspaces/ws-01-shared-credentials.md).

| Checked action | Observed result | Status |
| --- | --- | --- |
| Open each login page and select Continue as guest | Maths `/lectures` listed only Guest lecture 1001. English `/lectures` listed only Guest lecture 1101. | PASS |
| Sign in on Maths, then open English `/` | Maths opened `/student`. English still displayed its sign-in form. | PASS |
| Enter the same learner credentials on English | English opened `/student` as E2E learner 0182. | PASS |
| Open Maths `/student/exercises` | Only exercise 2001 appeared. Neither Maths grade 10 exercise 2002 nor English exercise 2101 appeared. | PASS |
| Open Maths `/student/lectures` and lecture 1003 | Guest, Standard and VIP Maths lectures appeared. The VIP detail page opened with a video region. | PASS |
| Open English exercise and lecture lists | Only exercise 2101 appeared. Lectures 1101 and 1102 appeared; VIP 1103 did not. | PASS |
| Open English Standard lecture 1102 | Its detail page and video region opened. | PASS |
| Navigate directly to English `/student/lectures/1103` | The page displayed “Không tìm thấy bài giảng”, a return link and no video player. | PASS |

Maths learner browsing used 390 × 844. English detail and denial checks used 1280 × 800.
The initial Guest-list snapshots showed the mobile shell, but their exact viewport dimensions were not recorded.
Playback was not started. External YouTube availability and video quality were outside this test.

## WS-06 passed with isolated completed attempts

Scenario: [submissions and history](../teaching-workspaces/ws-06-submissions-history.md).

| Checked action | Observed result | Status |
| --- | --- | --- |
| Start Maths exercise 2001 through its landing page | One attempt started. After browser recovery, the dashboard offered Continue for that same attempt. | PASS |
| Select B and inspect the selected MCQ before submission at 320 × 568 | A–D fit on one row. Clear wrapped inside the card. Previous and Next remained reachable. Document scroll width was 305px with a 320px viewport. | PASS |
| Open the mobile answer sheet | The dialog showed answered count 1/2, Algebra question buttons, Submit and Exit. | PASS |
| Use numbered question navigation on desktop | Selecting question 2 changed the heading and answer control to Algebra question 2. The browser entered numeric 0. | PASS |
| Scroll to Submit and inspect confirmation | An in-page dialog showed “Nộp bài?”, the irreversible-answer warning, Cancel and Submit. The browser selected final Submit once. | PASS |
| Inspect Maths summary and both review questions | Submission 4, attempt 1: 5/10, one correct, one incorrect, zero skipped. Review showed B versus B as correct and 0 versus 42 as incorrect. | PASS |
| Open English history before starting English | `/student/submissions` displayed the empty state. Maths submission 4 was absent. | PASS |
| Start English exercise 2101 and submit A for Reading, D for Grammar | Submission 5, attempt 1: 10/10, 2 correct, zero incorrect, zero skipped. | PASS |
| Inspect both English review questions | Reading showed A versus A as correct. Grammar showed D versus D as correct. | PASS |
| Return to both histories after both submissions | Maths listed only Maths exercise 2001 at 5/10. English listed only English exercise 2101 at 10/10. | PASS |

The completed routes were `/student/submissions/4/summary`, `/student/submissions/4/review`,
`/student/submissions/5/summary` and `/student/submissions/5/review`, on their owning origins.
Maths summary recorded 18:22 on 10 September 2026 and duration 9:54. English recorded 18:27 and duration 1:22, Asia/Saigon.
Submission and review checks used 1280 × 800. Initial Maths take and answer-sheet checks also used 390 × 844 and 320 × 568.

The review navigation displayed raw `0.25` beside each correct answer, while summary scores were normalized to 5/10 and 10/10.
This is an observed presentation detail, not evidence of a grading failure. No schema, answer key, scoring or attempt limit was changed.
Placeholder question images intentionally provided no readable exercise content; document-quality verification was outside scope.

## WS-07 passed and content was restored

Scenario: [content persistence](../teaching-workspaces/ws-07-content-persistence.md).

| Checked action | Reload-verified result | Status |
| --- | --- | --- |
| Edit only exercise 2002 title at `/teacher/exercises/2002` | Temporary title `E2E learning 01ff6 title persistence 2002` appeared after reload. | PASS |
| Restore the exact original title | `QA Maths Grade 10 Hidden From Grade 12 Exercise` appeared after another reload. | PASS |
| Record Maths lecture order and create 2 temporary lectures | Original order was 1001 → 1002 → 1003. Alpha became 1106; Beta became 1107. Each creation persisted after reload. | PASS |
| Edit Alpha | Title `E2E learning 01ff6 Alpha edited` persisted after reload. | PASS |
| Hide Alpha | After reload, its visibility action changed to “Hiển thị E2E learning 01ff6 Alpha edited cho học sinh”. | PASS |
| Move Alpha down once, swapping only the temporary pair | Order became 1001 → 1002 → 1003 → 1107 → 1106 after reload. | PASS |
| Delete Alpha and Beta using their native confirmation dialogs | Each dialog named the intended temporary lecture. Session-level dialog acceptance completed each deletion. Reload showed only 1001 → 1002 → 1003. | PASS |
| Scroll mobile exercise and lecture forms to primary actions | At 390 × 844, Save/Cancel and lecture Save changes/Cancel were fully reachable after scrolling. No document horizontal overflow occurred. | PASS |

Both temporary lectures used section `E2E learning 01ff6 temporary` and the supported fixture video URL.
They retained default all-programme and Standard access. No original lecture metadata or visibility was changed.
The browser checked the final lecture list for the `01ff6` marker; it was absent.

## Sidebar relocation passed the requested rendered checks

The parent changed the shared shell during this run. These checks used the updated render on `/student` and `/student/exercises`.
The browser selected Light and Dark through the actual theme menu, rather than overriding media preferences.

| Viewport and state | Observed result | Status |
| --- | --- | --- |
| 1280 × 800 expanded sidebar, light and dark | Header contained SmartClass branding only. Workspace and audience labels appeared in the footer above account and settings. | PASS |
| 1280 × 800 collapsed rail, dark | Existing compact labelled rail remained usable. No workspace or audience labels leaked into the rail. Its existing account label remained. | PASS |
| 390 × 844 open mobile drawer, light and dark | SmartClass-only drawer header; workspace and audience labels only in the footer; Settings, theme and logout fully visible. | PASS |
| 320 × 568 drawer, light | Labels remained readable. Scrolling the dialog exposed the complete footer and logout. Document scroll width was 320px. | PASS |
| 844 × 390 shell and open drawer, light | Mobile header showed SmartClass only. The drawer scrolled to expose Settings, theme and logout without horizontal clipping. | PASS |

At compression sizes, the footer was initially below the fold. Scrolling `[role="dialog"]` exposed the footer.
Scrolling the underlying page did not move the drawer. This was not an unreachable-action defect.

## Inspected screenshot evidence

All paths below are relative to the repository root under `.amp/in/artifacts/`.
Each image was moved from the exact temporary path returned by Agent Browser and inspected with `view_media`.

| Files | Evidence |
| --- | --- |
| `e2e-learning-maths-vip-390-light.png`, `e2e-learning-english-vip-denied.png` | Allowed Maths VIP detail and denied English VIP detail |
| `e2e-learning-maths-selected-320.png` | Selected B, wrapped Clear, complete answer controls before submission |
| `e2e-learning-maths-confirm-1280.png` | In-page submission confirmation |
| `e2e-learning-maths-summary-4.png`, `e2e-learning-maths-review-4.png` | Maths score and incorrect numeric answer review |
| `e2e-learning-english-summary-5.png` | English 10/10 summary |
| `e2e-learning-maths-history.png`, `e2e-learning-english-history.png` | Separate final workspace histories |
| `e2e-learning-exercise-form-390.png`, `e2e-learning-lecture-form-390-scrolled.png` | Mobile primary actions after scrolling |
| `e2e-learning-lectures-reordered.png`, `e2e-learning-lectures-restored.png` | Temporary pair reorder and final original lecture list |
| `e2e-learning-shell-1280-light.png`, `e2e-learning-shell-1280-dark.png` | Expanded desktop sidebar in both themes |
| `e2e-learning-shell-rail-1280-dark.png` | Collapsed rail |
| `e2e-learning-shell-drawer-390-light.png`, `e2e-learning-shell-drawer-390-dark.png` | Mobile drawer in both themes |
| `e2e-learning-shell-drawer-320-light.png`, `e2e-learning-shell-drawer-320-footer.png` | 320px drawer before and after container scrolling |
| `e2e-learning-shell-844-light.png`, `e2e-learning-shell-drawer-844-top.png`, `e2e-learning-shell-drawer-844-footer.png` | Landscape header, drawer top and reachable footer |

Screenshots of long content lists show only the viewport. DOM inspection established complete order and absence of temporary rows.
The initial lecture-form capture had the action near the lower edge. The later scrolled capture verified complete reachable buttons.

## Interruptions and closure

One fresh Maths learner login displayed “Something went wrong. Please try again later.” A single visible retry succeeded.
The parent independently reported intermittent local D1/workerd errors. This run did not restart or reset those services.

Managed command failures were recorded as temporary tooling blocks, not application defects.
Failures included an unsupported semantic-selector flag, unsupported selector syntax and selectors that did not match the current DOM.
In particular, a button's default DOM `type` property did not imply a literal `[type="submit"]` attribute.
The browser also needed explicit scrolling before some off-screen clicks. Each failed session was recovered to verified closure before replacement.
The same Maths attempt was resumed; answers were re-entered in the fresh profile before its final submission. No extra attempt was created.

Owner: [learning and content thread](https://ampcode.com/threads/T-01a08af5-02ba-7047-bc01-4ea8d0a01ff6).
Every session used a fresh ephemeral headless profile with this actual thread ID and stable owned tab IDs.

| Managed session | Final lifecycle state |
| --- | --- |
| `5e4e15d8-87da-4c2b-8818-f4e61543e65e` | Recovered, closed, no pending reasons |
| `e12e7daa-a954-4b60-8961-92452259fe10` | Recovered, closed, no pending reasons |
| `704a4ec3-50b1-432a-9487-d49970048886` | Recovered, closed, no pending reasons |
| `313f6f52-4af8-4b0f-aa80-31d7c094f998` | Recovered, closed, no pending reasons |
| `633a4683-18fa-4226-a4ad-cd6f912b973a` | Recovered, closed, no pending reasons |
| `427f1867-e7ed-4afb-bd50-cdc90d617263` | Owner stop verified closed, no attached threads or pending reasons |

The final session owned Maths tab `t2` and English tab `t3`. Its verified closure ended both tabs and the owned browser listeners.
The application servers were left running. This thread created only this durable report and its requested screenshot artifacts.
