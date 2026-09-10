# WS-04: Pending status needs separate approval

Before running, follow the [shared setup and reporting rules](README.md).

Actor: pending student. Do not reuse an already-approved actor from an earlier run.

1. Sign in on Maths. Expect pending status, Settings and logout, but no learning access.
2. As Maths teacher, assign programmes 10 and 12 to this student. Reload the list.
3. Expect the student to remain pending with both programmes. Assignment must not approve them.
4. Approve explicitly. Refresh the student's Maths page. Expect active learning access.

Pass: only the explicit approval changes status. Leave this new actor approved and record its final state.
The migrated empty-programme guard has separate integration coverage; this case uses a registration with requested programmes.
