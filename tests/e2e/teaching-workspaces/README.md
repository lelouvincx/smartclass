# Teaching workspaces end-to-end tests

These are manual end-to-end tests for a human or Agent Browser. They use the real frontend, local Worker, D1 and R2.
They are not Playwright tests or part of `npm test`. API fixture preparation is not evidence that a browser scenario passed.
The intended feature is defined by [RFC-17](../../../docs/plans/RFC-17-2026-09-09-teaching-workspaces.md); production still follows PRODUCT.md until release.

## Scenarios

Read the setup and reporting rules below before running a case.

| Case | Scenario |
| --- | --- |
| WS-01 | [Shared credentials, separate workspace access](ws-01-shared-credentials.md) |
| WS-02 | [Wrong-site teachers reach their teaching site](ws-02-teacher-routing.md) |
| WS-03 | [Teacher disabling stays local](ws-03-local-disable.md) |
| WS-04 | [Pending status needs separate approval](ws-04-pending-approval.md) |
| WS-05 | [Global block requires an administrator and confirmation](ws-05-global-block.md) |
| WS-06 | [Submit and review without mixing workspace history](ws-06-submissions-history.md) |
| WS-07 | [Teacher changes survive reload](ws-07-content-persistence.md) |

## Prepare one isolated run

Use the dedicated local QA emulator state, never production or an unrelated development database.
Maths uses <http://localhost:5173> and API port 8787. English uses <http://localhost:5174> and API port 8788.
Use `localhost`, not `127.0.0.1`; the application maps exact origins.

The environment must contain these synthetic fixtures:

| Actor or content | Required state |
| --- | --- |
| Maths teacher `+84865481769` | Active Maths teacher |
| English teacher `+84865481770` | Active English teacher |
| Platform admin `+84865481771` | Platform administrator; can stay on either site |
| Maths exercises 2001 and 2002 | Ready; programmes 12 and 10 respectively |
| English exercise 2101 | Ready; programme 10 |
| Maths lectures 1001, 1002, 1003 | Visible Guest, Standard and VIP respectively |
| English lectures 1101, 1102, 1103 | Visible Guest, Standard and VIP respectively |

All synthetic passwords are `123`. Never use production passwords.
Exercise fixtures need matching local R2 objects. Placeholder images and PDFs test delivery and controls, not document quality.
The current prepared state is `.amp/in/workspace-stage-2/qa-state`; its existing setup script resets that state, so do not rerun it during QA.
On a fresh checkout, provision the fixture contract above first. The account helper does not create schema, teachers or content.

Choose 3 unused synthetic phone numbers and prepare disposable actors. Run from the repository root:

```sh
mise exec -- node tests/e2e/prepare-workspaces.mjs \
  +84900000181 +84900000182 +84900000183
```

The helper creates an access-test student, a learner and a pending Maths student, in that order.
Access and learner accounts start active on both sites: Maths grade 12 VIP; English grade 10 Standard.
The pending account starts with Maths grade 12 Standard and has no English membership.
The helper refuses existing identities rather than resetting them. A failed partial setup leaves new accounts for inspection; choose new numbers on retry.
Save its token-free output as the run's fixture manifest under `.amp/in/`.

## Run and report

Use fresh browser profiles. Keep teacher/admin sessions separate from student sessions or sign out before switching actors.
Agent Browser users must follow the installed skill and local managed-session lifecycle. Each agent owns and closes its own session.
Use visible forms and controls for scenario actions. DOM inspection can verify state; direct API writes cannot substitute for those actions.
For each case, record PASS, FAIL or BLOCKED, the actual result, actor, viewport, screenshot paths and cleanup result.
Capture screenshots under `.amp/in/artifacts/` and inspect them. A captured but uninspected image is not verification.
Exercise baseline 390 × 844 and 1280 × 800, inspect light and dark states, and check 320 × 568 and 844 × 390 for compression.
Keep full run results under `tests/e2e/runs/`; keep raw logs and screenshots under `.amp/in/`.
A tool failure is BLOCKED until recovery, not an application failure or a pass. Ask Chinh when a missing decision prevents a safe check.

Parallel ownership:

- access agent: WS-02 to WS-05; may mutate only the access and pending actors
- learning/content agent: WS-01, WS-06 and WS-07; may mutate only the learner, exercise 2002 metadata and its own temporary lectures
- each agent restores its changes and closes its own browsers; leave user-requested application servers running
