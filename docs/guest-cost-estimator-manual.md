# Guest cost estimator user manual

This manual is for workspace administrators who need to estimate Guest delivery volume before a public launch or campaign.

The estimator uses the current workspace inventory. It is not analytics, visitor tracking, or a provider bill.

## Who can use the estimator

Only workspace administrators can open the cost estimator.

Teachers, students, guests, disabled accounts, and invalid sessions cannot use the estimator.

## Open the estimator

1. Sign in to the teaching site as a workspace administrator.
2. Open the teacher workspace.
3. Select **Chi phí** or **Costs** in the sidebar.

The estimator opens at `/teacher/costs`.

## What the inventory includes

The inventory includes only content that can currently be delivered to a Guest visitor in the current workspace.

The estimator includes:

- ready Guest exercises
- question images from the active confirmed question set
- source Exercise PDF metadata
- visible placed Guest lectures

The estimator excludes:

- Standard and VIP exercises
- inactive Guest exercises
- unconfirmed or old question sets
- solution PDFs
- teacher-only answer-detail images
- hidden Guest lectures
- unplaced Guest lectures
- YouTube delivery
- repeated views of the same question image
- Workers CPU, D1 row billing, and shared Cloudflare allowances
- Cohere parsing
- domain registration
- ChatGPT subscriptions

## Read the inventory cards

The **Current public Guest inventory** section shows what is public now.

| Card | Meaning |
| --- | --- |
| Guest exercises | Ready Guest exercises in the current workspace. |
| Question images | Student-facing question images that Guest visitors can load. |
| Exercise PDFs | Source Exercise PDFs for included Guest exercises. |
| Placed Guest lectures | Visible Guest lectures that are placed in the curriculum. |

If SmartClass does not know a source PDF size, the PDF byte value shows **Unknown**. SmartClass does not replace an unknown file size with zero.

## Enter a monthly scenario

Use the **Monthly scenario** section to enter hypothetical monthly activity.

Enter whole numbers only. If you enter a decimal, SmartClass rounds it down for the estimate. If you enter a negative or invalid value, SmartClass treats it as zero.

| Field | Meaning |
| --- | --- |
| Exercise list views | Guest visitors load the public exercise list. |
| Exercise landing views | Guest visitors open a public exercise landing page. |
| Complete exercise runs | Guest visitors complete one exercise run. One run assumes each current question image is viewed once. |
| Source PDF downloads | Guest visitors download a source Exercise PDF. |

The estimator does not know which exercise each future visitor will choose. For exercise runs and PDF downloads, SmartClass uses an unweighted average across the current Guest exercise catalog.

## Read the estimated delivery units

The **Estimated delivery units** section shows units that may create platform load.

| Unit | Meaning |
| --- | --- |
| Dynamic requests | Estimated API requests for lists, landing pages, and exercise runs. |
| R2 Class B reads | Estimated public file reads for question images and source PDFs. |
| Recorded bytes served | Estimated bytes from recorded question-image and source-PDF sizes. |

If one or more source PDF sizes are unknown and the scenario includes PDF downloads, **Recorded bytes served** shows **Unknown**. The question-image byte estimate remains included in the calculation, but the combined byte total stays unknown.

## Review the exercise inventory

Use **Exercise inventory** to check which Guest exercises drive the estimate.

For each exercise, SmartClass shows:

- the exercise title
- the number of public question images
- recorded question-image bytes
- recorded source PDF bytes, or **Unknown**

If an exercise should not appear, check that the exercise is not published for Guest access. If an exercise should appear, check that it has an active confirmed question set and at least one answer-schema row.

## Refresh the inventory

Select **Refresh inventory** after a teacher publishes, unpublishes, prepares, hides, or replaces Guest content.

The estimator reloads the current workspace inventory. The monthly scenario values stay in the form while the page reloads the inventory.

## Use the estimate safely

Use the estimator for launch planning and rough capacity checks.

Do not use the estimator as:

- a traffic report
- a billing report
- a record of Guest attempts
- a record of Guest answers or scores
- a Cloudflare invoice forecast

Guest attempts, answers, scores, and reviews stay in the visitor's browser. SmartClass does not send that local attempt data to the server for this estimate.

## Add costs that the estimator does not model

Use the dashboard estimate as one input to a launch budget. Add the following costs separately:

| Cost | How to treat it |
| --- | --- |
| Cohere parse v5 | Add the expected parsing cost for preparing exercises. This cost happens when SmartClass reads or prepares content, not when Guests view content. |
| Cloudflare hosting | Check Workers, Pages, D1, and R2 costs in the Cloudflare account. The estimator shows only some request, read, and byte units. |
| Domains | Add yearly domain renewal costs for `toanthaythanh.com` and `tienganhcothuy.com`. |
| ChatGPT subscriptions | Add one month of ChatGPT subscription cost ×20 for development work, if that cost is part of the launch plan. |

Keep these costs outside the dashboard unless SmartClass has a maintained rate card and a clear owner for updating prices.

## Troubleshooting

### You cannot see the Costs navigation item

You are not signed in as a workspace administrator. Ask a current workspace administrator to check your account role.

### The page says you need workspace administrator access

Your account does not have workspace administrator access, or your session is no longer valid. Sign out and sign in again with a workspace administrator account.

### The inventory is empty

The current workspace has no ready public Guest content. Check whether Guest exercises and Guest lectures have been published, prepared, placed, and made visible.

### A PDF byte value is Unknown

SmartClass does not have file-size metadata for that source Exercise PDF. The estimator keeps the byte total unknown rather than undercounting.

### The estimate changed after content edits

The estimator uses current inventory. Publishing, unpublishing, replacing, hiding, or preparing Guest content can change the estimate.
