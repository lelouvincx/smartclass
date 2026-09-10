# WS-03: Teacher disabling stays local

Before running, follow the [shared setup and reporting rules](README.md).

Actor: access-test student, initially active on both sites. Record both memberships first.

1. Keep student sessions open on both sites. In a separate teacher session, disable only that student on Maths.
2. Refresh Maths and try a learning route. Expect denied learning access; Settings and logout remain available.
3. Refresh English. Expect learning access to remain available.
4. As Maths teacher, inspect the student's menu. Expect local actions but no global account control.
5. Restore the Maths membership and refresh the student session. Expect Maths access and its original programmes/tier.

Cleanup: access-test student active on both sites; original programmes and tiers preserved.
