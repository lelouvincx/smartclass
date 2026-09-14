# SmartClass repository instructions

## Read before changing behavior

- Before changing or describing shipped product behavior, read `PRODUCT.md`; it is authoritative. Treat `TODO.md` and superseded RFC content as proposals, not current behavior.
- Before changing an established flow, read the relevant RFC under `docs/plans/` and any later RFC that supersedes it. RFCs preserve rationale and migration status but do not override `PRODUCT.md`.
- Before any frontend change-including a route, component, style, copy, or client-side interaction-read and follow `DESIGN.md`; it is the normative UI and frontend-acceptance contract.
- When Hono behavior is uncertain, read `https://hono.dev/llms-small.txt` first, then only the relevant section of `https://hono.dev/llms-full.txt`.

## Safety and authorship

- Publish every change through a pull request as `lelouvincx-bot`. Resolve `GH_TOKEN` non-interactively from `~/.credentials/agent-secrets/lelouvincx-bot.env` with the Agent Secrets service account and pass it only to the `gh` or Git child process. If `agent-secrets` does not permit that child command, resolve the reference with `@1password/sdk` and `~/.local/share/agent-secrets/op-service-account-token`; do not start an interactive 1Password sign-in. If bot authentication is unavailable, stop rather than falling back to a personal identity.
- When Chinh says "open bot PR", open the pull request with the bot identity in the current worktree.
- Apply the "PR merged" cleanup workflow only to the bot PR opened by this thread. If another PR merged, acknowledge it and continue the active task. If the PR is unclear, ask which one.
- For this thread's merged PR, confirm its `main` tests and Worker deployment passed. Then verify that `https://api.toanthaythanh.com/api/version` reports the full merge hash in `data.commit`. Do not clean up while checks are pending or failed, production reports another commit, or uncommitted or unpushed work remains outside the merged PR.
- After those checks pass, sync the repository, return to the branch active before the bot PR work, close the agent browser, clear this thread's schedule if present, and archive the thread. Preserve unrelated work.
- Name branches `<type>/<kebab-case-summary>`, using a Conventional Commits type, and write Conventional Commits messages.
- Immediately before `gh pr create`, authenticate with the bot credential and verify that `gh api user --jq .login` returns `lelouvincx-bot`.
- Local setup and Orb work may mutate only local D1 and R2 emulator state. Do not run Wrangler with `--remote`, deploy, seed production, or otherwise mutate remote Cloudflare resources unless the user explicitly requests it.
- For local product testing, sign in automatically with a seed account instead of asking Chinh: teacher `+84865481769` or active student `+84900000001`, both with password `123`.
- Do not seed `exercise_files` rows unless the corresponding local R2 objects are also seeded.

## Local API development

- Run Node tooling through `mise exec --` to use the version pinned in `mise.toml`. The default shell Node may reject the `--no-webstorage` flag used by the tests.
- When local Wrangler needs Cohere, first run `agent-secrets run --bundle smartclass-cohere -- /Users/lelouvincx/.local/bin/smartclass-wrangler-dev probe`. This checks credential availability without printing the key. If it passes, use the same command with `dev` instead of `probe`. If it fails, report the blocker; do not substitute another bundle or store a plaintext key.
- The wrapper source belongs to the `agent-skills` project at `/Users/lelouvincx/Developer/agent-skills/bin/smartclass-wrangler-dev`. Do not edit its projected symlink or extend its fixed local command while working on SmartClass.

## Change contract

- For behavioral changes, add or update the failing test first, then implement the smallest change that makes it pass.
- When a page's API contract changes, include a test that mounts the real page, navigation hooks and `src/lib/api.js`, stubbing only `fetch`. Mocked hooks do not verify request or response contracts. Test Worker route changes through the final app in `worker/index.js`.
- When editing `DESIGN.md`, keep its YAML front matter valid against the `@google/design.md` schema, retain Google's canonical `##` section names and order, keep `src/design-system/tokens.css` synchronized with front-matter token changes, and run `mise exec -- npx @google/design.md lint DESIGN.md`; it must exit successfully.
- Use `jsonSuccess` and `jsonError` from `worker/lib/response.js` for API responses.
- Keep frontend API operations behind `request()` in `src/lib/api.js`. Use XHR only when upload-progress events are required.
- Use `DB.batch()` when multiple D1 statements must commit atomically; separate `.run()` calls are not one transaction.

## Maintenance

- Add each planned task to `TODO.md` under its target version with a P0, P1, or P2 priority.
- In the pull request that completes a task, remove it from `TODO.md` and add its completed-change entry under `[Unreleased]` in `CHANGELOG.md`.
- Add a `CHANGELOG.md` entry under `[Unreleased]` for every pull request. After opening the pull request, add its number and link in a separate commit.
- Record planned work only in `TODO.md` and completed work only in `CHANGELOG.md`; keep both out of `README.md`.
- Check `CHANGELOG.md` before searching Git or pull-request history for a historical change.

## Completion

- While iterating, run the tests relevant to the changed behavior.
- For every frontend change, complete the [frontend acceptance checklist](DESIGN.md#frontend-acceptance) and include its required evidence in the pull request description.
- Local browser acceptance is permanently pre-approved for SmartClass. This overrides the personal convention requiring permission for live browser testing. Use the Agent Browser skill and managed lifecycle on macOS. This approval covers local app testing, not production changes or adding browser-test dependencies.
- Before archiving a thread, stop every local frontend and backend process that the thread started, verify that their listeners are gone, and leave processes owned by other threads running.
- Before opening a pull request containing application or database changes, run:
  - `mise exec -- npm test`
  - `mise exec -- npm run test:worker`
  - `mise exec -- npm run test:integration`
  - `mise exec -- npm run build`
- Report any check that could not run and why.
