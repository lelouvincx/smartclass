# SmartClass repository instructions

## Read before changing behavior

- Before changing or describing shipped product behavior, read `PRODUCT.md`; it is authoritative. Treat `TODO.md` and superseded RFC content as proposals, not current behavior.
- Before changing an established flow, read the relevant RFC under `docs/plans/` and any later RFC that supersedes it. RFCs preserve rationale and migration status but do not override `PRODUCT.md`.
- Before frontend or visual work, read `DESIGN.md`. Use `src/design-system/tokens.css` and `src/design-system/` for normative tokens and product compositions; keep low-level shadcn primitives in `src/components/ui/`.
- When Hono behavior is uncertain, read `https://hono.dev/llms-small.txt` first, then only the relevant section of `https://hono.dev/llms-full.txt`.

## Safety and authorship

- Publish every change through a pull request as `lelouvincx-bot`. Resolve `GH_TOKEN` non-interactively from `~/.credentials/agent-secrets/lelouvincx-bot.env` with the Agent Secrets service account and pass it only to the `gh` or Git child process. If `agent-secrets` does not permit that child command, resolve the reference with `@1password/sdk` and `~/.local/share/agent-secrets/op-service-account-token`; do not start an interactive 1Password sign-in. If bot authentication is unavailable, stop rather than falling back to a personal identity.
- When Chinh says "open bot PR", open the pull request with the bot identity in the current worktree.
- When Chinh says "PR merged", confirm tests have passed and production is deployed, sync the local Git repository, switch back to the branch that was active before the bot PR work, clear the schedule, and archive the working thread.
- Name branches `<type>/<kebab-case-summary>`, using a Conventional Commits type, and write Conventional Commits messages.
- Immediately before `gh pr create`, authenticate with the bot credential and verify that `gh api user --jq .login` returns `lelouvincx-bot`.
- Local setup and Orb work may mutate only local D1 and R2 emulator state. Do not run Wrangler with `--remote`, deploy, seed production, or otherwise mutate remote Cloudflare resources unless the user explicitly requests it.
- Do not seed `exercise_files` rows unless the corresponding local R2 objects are also seeded.

## Change contract

- For behavioral changes, add or update the failing test first, then implement the smallest change that makes it pass.
- Use `jsonSuccess` and `jsonError` from `worker/lib/response.js` for API responses.
- Keep frontend API operations behind `request()` in `src/lib/api.js`. Use XHR only when upload-progress events are required.
- Use `DB.batch()` when multiple D1 statements must commit atomically; separate `.run()` calls are not one transaction.
- When adding or changing a D1 migration, update `docs/schema.dbml` in the same change.

## Maintenance

- Add each planned task to `TODO.md` under its target version with a P0, P1, or P2 priority.
- In the pull request that completes a task, remove it from `TODO.md` and add its completed-change entry under `[Unreleased]` in `CHANGELOG.md`.
- Add a `CHANGELOG.md` entry under `[Unreleased]` for every pull request. After opening the pull request, add its number and link in a separate commit.
- Record planned work only in `TODO.md` and completed work only in `CHANGELOG.md`; keep both out of `README.md`.
- Check `CHANGELOG.md` before searching Git or pull-request history for a historical change.

## Completion

- While iterating, run the tests relevant to the changed behavior.
- Before opening a pull request containing application or database changes, run:
  - `npm test`
  - `npm run test:worker`
  - `npm run test:integration`
  - `npm run build`
- Report any check that could not run and why.
