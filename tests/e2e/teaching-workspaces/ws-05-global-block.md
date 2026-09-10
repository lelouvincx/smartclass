# WS-05: Global block requires an administrator and confirmation

Before running, follow the [shared setup and reporting rules](README.md).

Run after [WS-03](ws-03-local-disable.md). Actor: access-test student, active on both sites.

1. As admin, open the student's global-block action. Leave confirmation blank, then enter a wrong value. Expect submission to remain disabled.
2. Enter `GLOBAL` and confirm. Refresh existing student sessions on both sites and attempt a fresh sign-in. Expect both sites to deny access.
3. Restore globally using the same confirmation rule. Sign in again on both sites.
4. Expect the original local status, programmes and tier on each site; restore must not replace memberships.
5. Inspect the admin account's own student-row menu where present. Expect no global-block action for an administrator target.

Cleanup: access-test identity globally enabled, original memberships intact. If cleanup fails, stop and report the exact actor and state.
