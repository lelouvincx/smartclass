# WS-07: Teacher changes survive reload

Before running, follow the [shared setup and reporting rules](README.md).

Actor: Maths teacher. Preserve existing content and access rules.

1. Record exercise 2002's exact title. Change only the title, save and reload. Verify persistence, then restore the original and reload again.
2. Create 2 uniquely named temporary lectures. Record their IDs and the original lecture order.
3. Edit one temporary lecture and hide it. Reload; expect both changes to persist.
4. Reorder only the 2 temporary lectures relative to each other. Reload; expect the new order, with original lectures unchanged.
5. Delete both temporary lectures through their real confirmation controls. Reload; expect no temporary rows and the original order.
6. On mobile, scroll content forms to their primary actions. Expect full reachable buttons, readable labels and no horizontal overflow.

Cleanup: original exercise title and original lecture order restored; both temporary lectures absent. Report incomplete cleanup instead of deleting unrelated fixtures.
