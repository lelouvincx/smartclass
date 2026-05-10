---
rfc: RFC-7
title: Google Account Link & Login
date: 2026-05-10
status: Draft
dependencies: [RFC-1]
---

# RFC-7 — Google Account Link & Login

**Date:** 2026-05-10
**Status:** Draft
**Owner:** TBD

## Problem

Phone+pw only → forgot pw = teacher reset. No recovery path. SMS = $$$ + telco. Email = no email column.

Goal: link Google → login via Google → recovery free.

## Goals

- Link Google to existing phone acct (Settings).
- Login via Google if linked.
- Same `users.id` either way.

## Non-goals

- **No Google-first acct creation.** Acct only via phone (teacher creates / self register). Google = link only.
- No auto-link by email match (consent must be explicit).
- No other providers.
- No phone forgot-pw flow (separate Roadmap item).
- No Google Workspace SSO.
- No guest mode interaction.

## UX

### Login page
```
╭──────────────────────────╮
│ Phone   [_________]      │
│ Pass    [_________]      │
│ [ Sign In ]              │
│  ── or ──                │
│ [ G  Continue w/ Google ]│  ← login-only, must be linked
│                          │
│ No acct? Register        │
╰──────────────────────────╯
```

### Register page

Phone only. **No Google button.** Google appears only after acct exists, via Settings.

### Settings (new page `/settings`)

Reuse `Card` + `Field` + `Button` + `Badge` + `Dialog`.

```
╭─ Connected accounts ─────────────╮
│ Google                           │
│ [Not linked]   [ Connect Google ]│
╰──────────────────────────────────╯
```

After link:
```
╭─ Connected accounts ─────────────╮
│ Google     foo@gmail.com [Linked]│
│            [ Disconnect ]        │
╰──────────────────────────────────╯
```

### Recovery

User forgot pw → click "Continue w/ Google" on login → if Google `sub` matches linked row → in. Else `404 NO_LINKED_ACCOUNT`, copy: "No SmartClass acct linked to this Google. Login w/ phone, link in Settings."

## Arch

### Provider: Google OIDC, Auth Code + PKCE

Why:
- PKCE → no client secret in SPA bundle (still server-side for token exchange).
- Server verifies `id_token` via JWKS → mints our JWT.
- No SDK. Workers = `fetch` + Web Crypto. `google-auth-library` = node-only, won't run.

Scopes: `openid email profile`. Need `sub` (immutable id) + `email` (display).

```diagram
╭───╮ click "Continue w/ Google"
│SPA│ ─────────▶ build URL (PKCE+state+nonce) → window.location → accounts.google.com
╰─┬─╯
  │ Google redirect → /auth/google/callback?code&state
  ▼
╭───╮ POST {code, code_verifier, redirect_uri}
│SPA│ ─────────▶ /api/auth/google/login (or /link if authed user)
╰─┬─╯
  │       worker: exchange code → verify id_token → match google_sub → mint JWT
  ▼ {token, user}
```

### CSRF / replay

- `state` = 32B hex, `sessionStorage`, asserted on callback.
- `nonce` = 32B hex, asserted == `id_token.nonce`.
- PKCE `code_verifier` = 64B, `sessionStorage`, S256 challenge sent.
- All client-side. No D1 row, no KV.

## DB

Migration `0009_add_google_link.sql`:

```sql
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN google_email TEXT;

CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
```

Notes:
- **No table rebuild.** `phone` + `password_hash` stay NOT NULL. Every acct still has phone+pw — Google is **add-on**, not replacement.
- `google_sub` = join key. Immutable. Email may change.
- `google_email` = snapshot at link-time. Refreshed on each Google login.
- `email` reserved for future profile (Roadmap "Additional user fields"). Nullable.
- Update `docs/schema.dbml` same PR.

### Status rules (unchanged)

| Scenario                                 | role     | status     | result |
|------------------------------------------|----------|------------|--------|
| Google login, `sub` matches active user  | unchanged| active     | 200 + JWT |
| Google login, `sub` matches pending user | unchanged| pending    | 403 `ACCOUNT_PENDING` |
| Google login, `sub` matches disabled     | unchanged| disabled   | 403 `ACCOUNT_DISABLED` |
| Google login, no `sub` match             | —        | —          | 404 `NO_LINKED_ACCOUNT` |

No new role granted, ever. Teacher role only by manual seed/promote.

## API

### `POST /api/auth/google/login` (no auth)

Body:
```json
{ "code": "<google code>", "code_verifier": "<verifier>", "redirect_uri": "<exact>" }
```

Worker:
1. Validate body.
2. Exchange `code` → `oauth2.googleapis.com/token`.
3. Verify `id_token` via JWKS:
   - Fetch `googleapis.com/oauth2/v3/certs` (cached in module isolate).
   - RS256 sig.
   - `iss in {accounts.google.com, https://accounts.google.com}`, `aud == GOOGLE_CLIENT_ID`, `exp > now-60s`, `email_verified === true`, `nonce` matches.
4. Lookup user by `google_sub`. Not found → 404 `NO_LINKED_ACCOUNT`.
5. Status gate (pending/disabled).
6. Update `google_email` if changed.
7. Mint JWT via existing `issueAccessToken(env, user)`. Same response shape as `/api/auth/login`.

### `POST /api/auth/google/link` (authed)

Body same as login. Worker:
1. Verify id_token (same as above).
2. If `google_sub` already on another user → 409 `GOOGLE_SUB_TAKEN`.
3. UPDATE `users SET google_sub=?, google_email=? WHERE id = authUser.id`.
4. Return updated user.

### `DELETE /api/auth/google/link` (authed)

Clear `google_sub` + `google_email`. No safeguard needed (phone+pw still works — they're never null).

### `GET /api/auth/me` extended

Add `email`, `google_email` to response. Frontend uses for Settings render.

### Errors (consistent w/ existing auth)

| Code                       | HTTP | When |
|----------------------------|------|------|
| `VALIDATION_ERROR`         | 400  | missing fields |
| `INVALID_GOOGLE_CODE`      | 400  | Google rejects code (`invalid_grant`) |
| `INVALID_ID_TOKEN`         | 401  | sig/iss/aud/exp/nonce fail |
| `EMAIL_NOT_VERIFIED`       | 401  | `email_verified: false` |
| `NO_LINKED_ACCOUNT`        | 404  | login w/ Google but no `google_sub` match |
| `ACCOUNT_PENDING`          | 403  | matched user not active |
| `ACCOUNT_DISABLED`         | 403  | matched user disabled |
| `GOOGLE_SUB_TAKEN`         | 409  | link target sub already on another user |
| `GOOGLE_UNAVAILABLE`       | 502  | token endpoint or JWKS fetch fail |

## Frontend (shadcn-first)

### Components — reuse, don't reinvent

Already installed: `Button`, `Card`, `Input`, `Label`, `Badge`, `Dialog`, `Separator`, `Spinner`, `sonner`.

Add via CLI:
```bash
npx shadcn@latest add @shadcn/field
npx shadcn@latest add @shadcn/alert
npx shadcn@latest add @shadcn/empty
```

(`Field` for form layout per shadcn rules. `Alert` for callback errors. `Empty` for "no Google linked" state in Settings.)

Refactor existing `LoginPage.jsx` + `RegisterPage.jsx` form `<div>`s to `FieldGroup` + `Field` (per skill rule "Forms use `FieldGroup` + `Field`. Never raw `div` with `space-y-*`"). Drop `space-y-4`, use `gap-4`.

### New files

- `src/lib/google-oauth.js` — pure helpers:
  - `generatePkcePair()` → `{ verifier, challenge }` (Web Crypto SHA-256, base64url).
  - `randomString(byteLen)` → base64url.
  - `buildAuthUrl({ clientId, redirectUri, state, nonce, codeChallenge })`.
- `src/components/google-signin-button.jsx`:
  - Wraps shadcn `Button variant="outline" size="lg"`.
  - Inline Google G SVG passed as icon (lucide has no colored G). Pass via `data-icon="inline-start"` per icon rule.
  - On click: gen PKCE+state+nonce → store in `sessionStorage` → `window.location.assign(authUrl)`.
  - Prop: `mode = 'login' | 'link'` → only changes the post-callback redirect path.
- `src/pages/GoogleCallbackPage.jsx` (route `/auth/google/callback`):
  - Reads `?code` + `?state` + `?error`.
  - Asserts `state` matches `sessionStorage.google_oauth_state`.
  - On `?error=access_denied` → render `Alert variant="default"` "Cancelled" + back link.
  - Calls `loginWithGoogle()` or `linkGoogle()` based on stored `mode`.
  - Errors render in `Alert variant="destructive"`.
  - Success: login → navigate to role default. Link → navigate `/settings` w/ `toast.success("Google linked.")` (`sonner`).
- `src/pages/SettingsPage.jsx` (route `/settings`):
  - `Card` w/ `CardHeader CardTitle CardDescription CardContent CardFooter`.
  - Not linked: `Empty` w/ Connect button.
  - Linked: row showing `google_email` + `Badge variant="secondary"` "Linked" + `Button variant="destructive" size="sm"` "Disconnect" → opens `Dialog` (`AlertDialog` semantics — confirmation required) → on confirm calls `unlinkGoogle()` + `toast`.
- `src/components/connected-accounts-card.jsx` — encapsulates the Settings row above. Reusable if more providers added later.

### Edits

- `src/pages/LoginPage.jsx`:
  - Convert form to `FieldGroup` + `Field`.
  - Add `<Separator />` w/ "or" label below form.
  - Add `<GoogleSignInButton mode="login" />`.
- `src/pages/RegisterPage.jsx`:
  - Convert form to `FieldGroup` + `Field`. **No Google button.**
- `src/lib/api.js`:
  - `loginWithGoogle({ code, codeVerifier, redirectUri })`.
  - `linkGoogle(token, payload)`.
  - `unlinkGoogle(token)`.
- `src/lib/auth-context.jsx`:
  - Add `loginWithGoogleResponse(response)` helper (`setStoredToken` + `setUser`). No shape change.
- `src/router.jsx`:
  - Register `/auth/google/callback` (no auth required).
  - Register `/settings` (auth required, both roles).
- Header (existing teacher/student layout):
  - Add Settings link in dropdown (`DropdownMenuItem`).

### shadcn rule check

| Rule | Application |
|------|-------------|
| Forms use `FieldGroup`+`Field` | Login/Register/Settings refactored. |
| Buttons inside inputs use `InputGroup` | N/A — no inline buttons in input. |
| `Dialog` needs `DialogTitle` | Unlink confirm dialog has title. |
| Button no `isPending` | Use `Spinner` + `data-icon` + `disabled`. |
| Toasts via `sonner` | `toast.success` / `toast.error` after link/unlink. |
| Icons in Button via `data-icon` | Google G SVG `data-icon="inline-start"`. |
| No raw `space-x-*` / `space-y-*` | Use `flex` + `gap-*`. |
| Semantic colors only | `bg-primary` etc. No raw `bg-blue-500`. |
| `Empty` for empty state | Settings "not linked" uses `Empty`. |
| `Alert` for callouts | Callback errors use `Alert variant="destructive"`. |
| `Separator` not `<hr>` | Login "or" divider. |
| `Badge` not styled span | "Linked" status. |

## Config

Worker env (`.dev.vars` + `wrangler secret`):
- `GOOGLE_CLIENT_ID` — public, mirrored to SPA as `VITE_GOOGLE_CLIENT_ID`.
- `GOOGLE_CLIENT_SECRET` — server only.
- `GOOGLE_REDIRECT_URI` — defaults `${APP_CORS_ORIGIN}/auth/google/callback`.

Google Cloud Console:
- Create OAuth 2.0 Client ID (Web app).
- Origins: `http://localhost:5173`, `https://smartclass.lelouvincx.com`.
- Redirect URIs: same + `/auth/google/callback`.
- Consent screen External, scopes `openid email profile`, name "SmartClass".

README → add "Google OAuth setup" subsection w/ above + new env vars in example block.

## Edge cases

| Case | Behavior |
|------|----------|
| Google login, no link → user confused | 404 + Alert copy points to "Login w/ phone, link in Settings". |
| User links Google A, later tries to link Google B (same user) | Replace A → set `google_sub = B`. Last-write-wins. (Or 409 if we want safety. **Decision: replace** — simpler UX, user explicitly clicked Connect.) |
| Two users, same Google `sub` (impossible in practice) | UNIQUE index → 409 `GOOGLE_SUB_TAKEN`. |
| User unlinked Google, tries Google login | 404 `NO_LINKED_ACCOUNT`. |
| `email_verified: false` | 401. We don't trust unverified emails. |
| JWKS fetch fails | Fall back to module-cached JWKS. No cache → 502. |
| Token endpoint `invalid_grant` (code reused/expired/wrong redirect) | 400 `INVALID_GOOGLE_CODE`. SPA prompts retry. |
| Cancel on Google consent | `?error=access_denied` → "Cancelled" Alert + back link. |
| Clock skew | ±60s leeway on `exp`/`iat`. |
| Google email changed post-link | `sub` still matches → login works. `google_email` refreshed. |
| Replay old id_token | `nonce` mismatch → 401. |
| User w/ pending status links Google then logs in via Google | Status gate fires → 403 `ACCOUNT_PENDING`. Same as phone path. |

## Tests

### Backend integration (`worker/test/auth-google.integration.test.js`)

Mock `fetch` (token exchange + JWKS) via `vi.spyOn(globalThis, 'fetch')`.

Cover:
- Login w/ valid Google + linked user → 200 + JWT.
- Login w/ valid Google + no link → 404 `NO_LINKED_ACCOUNT`.
- Login w/ valid Google + pending user → 403.
- Login w/ valid Google + disabled user → 403.
- Login w/ bad sig → 401.
- Login w/ `email_verified: false` → 401.
- Login w/ missing `code` → 400.
- Link round-trip (login phone → link → me reflects `google_email`).
- Link when sub already on another user → 409 `GOOGLE_SUB_TAKEN`.
- Unlink → next Google login = 404.

### Backend unit (`worker/lib/google-oauth.test.js`)

- JWKS verifier: known good token + JWKS = pass; mutated sig = fail; expired = fail; wrong aud = fail; bad nonce = fail.
- Pure-fn tests, no D1.

### Frontend (`src/pages/GoogleCallbackPage.test.jsx`, `LoginPage.test.jsx`, `SettingsPage.test.jsx`)

- Callback: state mismatch → Alert. `?error=access_denied` → Cancelled. Success login → `loginWithGoogle` + navigate. Success link → `toast.success` + navigate `/settings`.
- Login: clicking Google btn calls `window.location.assign` w/ correct URL (assert query has `client_id`, `code_challenge`, `state`, `nonce`).
- Register: assert NO Google button rendered.
- Settings: not-linked = `Empty` + Connect btn. Linked = `Badge` "Linked" + Disconnect → Dialog → confirm → `toast.success`.

### Manual smoke

- Local: full link round-trip vs real Google on `localhost:5173`.
- Staging: same on prod redirect URI.

## Rollout

| PR | Scope |
|----|-------|
| **A** | Migration `0009`, `worker/lib/google-oauth.js` (URL builder + JWKS verifier), `POST /api/auth/google/login`, `POST/DELETE /api/auth/google/link`, integration tests, DBML update. No frontend. |
| **B** | shadcn add `field`/`alert`/`empty`. Refactor Login/Register forms to `Field`. New `GoogleSignInButton`, `GoogleCallbackPage`, `loginWithGoogle` API helper. Login page gets Google btn + `Separator`. |
| **C** | New `/settings` page, `ConnectedAccountsCard`, link/unlink flow, header dropdown link. |
| **D** | Docs: README env-var section, AGENTS.md "Design Decisions" entry. |

Each PR independently shippable.

## Cost / quota

- Google OIDC = free.
- 2 outbound `fetch` per Google login (token exchange + JWKS, JWKS cached). Negligible vs Workers free tier.

## Open questions

1. Multi-Google switch: replace (current decision) or 409? Default: replace.
2. Surface `google_email` in header? Default: no — only Settings.
3. Notify teacher when student links Google? Default: no.
4. Add audit log for link/unlink events? Default: no for v1; revisit when audit table exists.
