import { Hono } from 'hono'
import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessToken } from '../lib/auth.js'
import { _resetJwksCache } from '../lib/google-oauth.js'
import { makeIdToken, mockGoogleFetch } from '../test/google-oauth-helpers.js'
import { requireWorkspace } from '../middleware/workspace.js'
import { requireWorkspaceIdentity, requireWorkspaceStudent } from '../middleware/workspace-auth.js'
import router from './workspace-auth.js'
import usersRouter from './workspace-users.js'

const HASH_123 = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'
const MATHS = 'http://maths-api.test'
const ENGLISH = 'http://english-api.test'

function app() {
  const testApp = new Hono()
  testApp.use('/api/*', requireWorkspace)
  testApp.route('/api/auth', router)
  testApp.route('/api/users', usersRouter)
  testApp.get('/api/content/student', requireWorkspaceIdentity, requireWorkspaceStudent, (c) => c.json({ ok: true }))
  return testApp
}

function testEnv() {
  return { ...env, APP_ENV: 'test' }
}

async function request(path, init = {}, origin = MATHS) {
  return app().request(`${origin}${path}`, init, testEnv())
}

async function json(res) {
  return res.json()
}

async function seedUser({ phone, name = 'Test User', role = 'student', status = 'active', platformRole = 'user', disabledAt = null, googleSub = null, googleEmail = null }) {
  const result = await env.DB.prepare(`
    insert into users (name, phone, password_hash, role, status, platform_role, disabled_at, google_sub, google_email)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, phone, HASH_123, role, status, platformRole, disabledAt, googleSub, googleEmail).run()
  return result.meta.last_row_id
}

async function seedMembership({ userId, workspaceId = 'maths', role = 'student', status = 'active', accessTier = 'standard', displayName = null, grades = [10] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier, display_name)
    values (?, ?, ?, ?, ?, ?)
  `).bind(workspaceId, userId, role, status, accessTier, displayName).run()
  const membershipId = result.meta.last_row_id
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(
      'insert into workspace_membership_grades (membership_id, grade) values (?, ?)',
    ).bind(membershipId, grade)))
  }
  return membershipId
}

async function login(phone, origin = MATHS) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: '123' }),
  }, origin)
  return json(res)
}

async function token(phone, origin = MATHS) {
  return (await login(phone, origin)).data.token
}

async function membership(userId, workspaceId) {
  const row = await env.DB.prepare(`
    select id, workspace_id, user_id, role, status, access_tier, display_name
    from workspace_memberships
    where user_id = ? and workspace_id = ?
  `).bind(userId, workspaceId).first()
  if (!row) return null
  const grades = await env.DB.prepare(
    'select grade from workspace_membership_grades where membership_id = ? order by grade',
  ).bind(row.id).all()
  return { ...row, grades: grades.results.map((grade) => grade.grade) }
}

async function setupGoogleMock({ sub = 'google-sub', email = 'user@gmail.com', nonce = 'nonce' } = {}) {
  const { idToken, publicJwk } = await makeIdToken({ payload: { sub, email, nonce } })
  mockGoogleFetch({ tokenResponse: { status: 200, body: { id_token: idToken } }, jwks: { keys: [publicJwk] } })
}

function googleBody(overrides = {}) {
  return {
    code: 'code',
    code_verifier: 'verifier',
    redirect_uri: 'http://maths.test/auth/google/callback',
    expected_nonce: 'nonce',
    ...overrides,
  }
}

beforeEach(() => {
  _resetJwksCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('workspace auth phone login and registration', () => {
  it('rejects non-string credentials before password hashing or database binding', async () => {
    await seedUser({ phone: '+84900000120' })
    for (const path of ['/api/auth/login', '/api/auth/register']) {
      for (const invalid of [{ password: { value: '123' } }, { phone: ['+84900000120'] }]) {
        const res = await request(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Student', phone: '+84900000120', password: '123', grades: [10], ...invalid }),
        })
        expect(res.status).toBe(400)
        expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
      }
    }
  })

  it('registers a new shared identity with only a pending current-workspace membership', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  New Student  ', phone: '0900000101', password: '123', grades: [12, 10] }),
    })

    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body.data.user).toMatchObject({ name: 'New Student', phone: '+84900000101', platform_role: 'user', disabled_at: null })
    expect(body.data.user).not.toHaveProperty('role')
    expect(body.data.user).not.toHaveProperty('status')
    expect(body.data.membership).toMatchObject({ workspace_id: 'maths', role: 'student', status: 'pending', access_tier: 'standard', grades: [10, 12] })
    expect(await membership(body.data.user.id, 'english')).toBeNull()
    await expect(env.DB.prepare('select * from student_grades where user_id = ?').bind(body.data.user.id).all()).resolves.toMatchObject({ results: [] })
  })

  it('keeps an existing phone unchanged on cross-site registration conflict', async () => {
    const userId = await seedUser({ phone: '+84900000102', name: 'Original' })
    await seedMembership({ userId, workspaceId: 'maths', status: 'active', accessTier: 'vip', grades: [10] })

    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Overwrite', phone: '+84900000102', password: 'new', grades: [12] }),
    }, ENGLISH)

    expect(res.status).toBe(409)
    expect((await json(res)).error.code).toBe('PHONE_EXISTS')
    await expect(env.DB.prepare('select name from users where id = ?').bind(userId).first()).resolves.toEqual({ name: 'Original' })
    expect(await membership(userId, 'english')).toBeNull()
    expect(await membership(userId, 'maths')).toMatchObject({ status: 'active', access_tier: 'vip', grades: [10] })
  })

  it('issues separate workspace JWTs for the same shared phone and password', async () => {
    const userId = await seedUser({ phone: '+84900000103' })
    await seedMembership({ userId, workspaceId: 'maths', grades: [10] })
    await seedMembership({ userId, workspaceId: 'english', grades: [12] })

    const maths = await login('+84900000103', MATHS)
    const english = await login('+84900000103', ENGLISH)

    expect(maths.data.workspace.id).toBe('maths')
    expect(english.data.workspace.id).toBe('english')
    await expect(verifyAccessToken(maths.data.token, testEnv())).resolves.toMatchObject({ sub: String(userId), workspace_id: 'maths' })
    await expect(verifyAccessToken(english.data.token, testEnv())).resolves.toMatchObject({ sub: String(userId), workspace_id: 'english' })
  })

  it('allows pending and no-membership identity login but denies student content guards', async () => {
    const pendingId = await seedUser({ phone: '+84900000104' })
    await seedMembership({ userId: pendingId, workspaceId: 'maths', status: 'pending', grades: [10] })
    const noMembershipId = await seedUser({ phone: '+84900000105' })

    const pending = await login('+84900000104')
    const noMembership = await login('+84900000105')
    expect(pending.data.membership.status).toBe('pending')
    expect(noMembership.data.membership).toBeNull()

    const pendingContent = await request('/api/content/student', { headers: { Authorization: `Bearer ${pending.data.token}` } })
    const noMembershipContent = await request('/api/content/student', { headers: { Authorization: `Bearer ${noMembership.data.token}` } })
    expect(pendingContent.status).toBe(403)
    expect((await json(pendingContent)).error.code).toBe('MEMBERSHIP_PENDING')
    expect(noMembershipContent.status).toBe(403)
    expect((await json(noMembershipContent)).error.code).toBe('MEMBERSHIP_REQUIRED')
    expect(await membership(noMembershipId, 'maths')).toBeNull()
  })

  it('routes teachers to their active teaching workspace on wrong-site phone and Google login', async () => {
    const teacherId = await seedUser({ phone: '+84900000106', role: 'teacher', googleSub: 'teacher-google', googleEmail: 'old@gmail.com' })
    await seedMembership({ userId: teacherId, workspaceId: 'english', role: 'teacher', status: 'active', grades: [] })

    const phoneLogin = await login('+84900000106', MATHS)
    expect(phoneLogin.data.teacher_routing).toEqual({ action: 'redirect', destinations: [{ workspace_id: 'english', url: 'http://english.test' }] })
    await setupGoogleMock({ sub: 'teacher-google', email: 'new@gmail.com' })
    const googleLogin = await request('/api/auth/google/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(googleBody()),
    })
    expect(googleLogin.status).toBe(200)
    expect((await json(googleLogin)).data.teacher_routing.destinations[0].url).toBe('http://english.test')
  })

  it('globally disabled accounts cannot log in by password or Google', async () => {
    await seedUser({ phone: '+84900000107', disabledAt: '2026-09-10T00:00:00Z', googleSub: 'disabled-google' })
    const passwordLogin = await login('+84900000107')
    expect(passwordLogin.error.code).toBe('ACCOUNT_DISABLED')

    await setupGoogleMock({ sub: 'disabled-google' })
    const googleLogin = await request('/api/auth/google/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(googleBody()),
    })
    expect(googleLogin.status).toBe(403)
    expect((await json(googleLogin)).error.code).toBe('ACCOUNT_DISABLED')
  })
})

describe('workspace auth join and profile operations', () => {
  it('joins and gains approval independently on two sites through the combined account routes', async () => {
    const mathsTeacherId = await seedUser({ phone: '+84900000121' })
    const englishTeacherId = await seedUser({ phone: '+84900000122' })
    await seedMembership({ userId: mathsTeacherId, role: 'teacher', grades: [] })
    await seedMembership({ userId: englishTeacherId, workspaceId: 'english', role: 'teacher', grades: [] })
    const mathsTeacher = await token('+84900000121')
    const englishTeacher = await token('+84900000122', ENGLISH)
    const write = (path, origin, auth, body, method = 'PUT') => request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify(body),
    }, origin)
    const registered = await write('/api/auth/register', MATHS, null, {
      name: 'Shared Student', phone: '+84900000123', password: '123', grades: [10],
    }, 'POST')
    expect(registered.status).toBe(201)
    const userId = (await registered.json()).data.user.id
    const maths = await login('+84900000123')
    const english = await login('+84900000123', ENGLISH)
    expect(english.data.membership).toBeNull()
    const joined = await write('/api/auth/join', ENGLISH, english.data.token, { grades: [12] }, 'POST')
    expect(joined.status).toBe(201)

    const foreignApproval = await write(`/api/users/${userId}/approve`, ENGLISH, mathsTeacher, {})
    expect(foreignApproval.status).toBe(401)
    expect((await write('/api/users/grades', ENGLISH, englishTeacher, { student_ids: [userId], grades: ['dgnl'] })).status).toBe(200)
    const me = async (origin, auth) => (await (await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${auth}` },
    }, origin)).json()).data
    expect((await me(ENGLISH, english.data.token)).membership).toMatchObject({ status: 'pending', grades: ['dgnl'] })
    expect((await write(`/api/users/${userId}/approve`, ENGLISH, englishTeacher, {})).status).toBe(200)
    // Repeated approval is successful, including when the stored timestamp is unchanged.
    expect((await write(`/api/users/${userId}/approve`, ENGLISH, englishTeacher, {})).status).toBe(200)
    const content = (origin, auth) => request('/api/content/student', { headers: { Authorization: `Bearer ${auth}` } }, origin)
    expect((await content(ENGLISH, english.data.token)).status).toBe(200)
    expect((await content(MATHS, maths.data.token)).status).toBe(403)
    expect((await me(MATHS, maths.data.token)).membership).toMatchObject({ status: 'pending', grades: [10] })

    expect((await write(`/api/users/${userId}/approve`, MATHS, mathsTeacher, {})).status).toBe(200)
    expect((await content(MATHS, maths.data.token)).status).toBe(200)
    expect((await write(`/api/users/${userId}/status`, MATHS, mathsTeacher, { status: 'disabled' })).status).toBe(200)
    expect((await content(MATHS, maths.data.token)).status).toBe(403)
    expect((await content(ENGLISH, english.data.token)).status).toBe(200)
  })

  it('creates one pending membership on join and preserves existing duplicate/concurrent grade requests', async () => {
    const userId = await seedUser({ phone: '+84900000108' })
    const auth = await token('+84900000108', ENGLISH)

    const first = await request('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ grades: [10] }),
    }, ENGLISH)
    expect(first.status).toBe(201)

    await env.DB.prepare(`
      update workspace_memberships set status = 'disabled', access_tier = 'vip', display_name = 'Local Name'
      where user_id = ? and workspace_id = 'english'
    `).bind(userId).run()

    const duplicate = await request('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ grades: [12, 'dgnl'] }),
    }, ENGLISH)
    expect(duplicate.status).toBe(200)
    expect(await membership(userId, 'english')).toMatchObject({ status: 'disabled', access_tier: 'vip', display_name: 'Local Name', grades: [10] })
  })

  it('handles concurrent join conflicts without mixing grade sets', async () => {
    const userId = await seedUser({ phone: '+84900000109' })
    const auth = await token('+84900000109', ENGLISH)
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }

    const [a, b] = await Promise.all([
      request('/api/auth/join', { method: 'POST', headers, body: JSON.stringify({ grades: [10] }) }, ENGLISH),
      request('/api/auth/join', { method: 'POST', headers, body: JSON.stringify({ grades: [12, 'dgnl'] }) }, ENGLISH),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 201])
    const saved = await membership(userId, 'english')
    expect([[10], [12, 'dgnl']]).toContainEqual(saved.grades)
  })

  it('updates shared name, Google link and unlink without changing memberships', async () => {
    const userId = await seedUser({ phone: '+84900000110', name: 'Before' })
    await seedMembership({ userId, workspaceId: 'maths', status: 'pending', grades: [10] })
    const auth = await token('+84900000110')

    const name = await request('/api/auth/name', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ name: '  After  ' }),
    })
    expect((await json(name)).data.user.name).toBe('After')

    const me = await request('/api/auth/me', { headers: { Authorization: `Bearer ${auth}` } })
    expect(me.status).toBe(200)
    expect((await json(me)).data).toMatchObject({
      user: { id: userId, name: 'After', phone: '+84900000110' },
      workspace: { id: 'maths', google_redirect_uri: 'http://maths.test/auth/google/callback' },
      membership: { workspace_id: 'maths', status: 'pending', grades: [10] },
    })

    await setupGoogleMock({ sub: 'fresh-google', email: 'fresh@gmail.com' })
    const link = await request('/api/auth/google/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify(googleBody()),
    })
    expect(link.status).toBe(200)
    expect((await json(link)).data.user.google_email).toBe('fresh@gmail.com')
    expect(await membership(userId, 'maths')).toMatchObject({ status: 'pending', grades: [10] })

    const unlink = await request('/api/auth/google/link', { method: 'DELETE', headers: { Authorization: `Bearer ${auth}` } })
    expect((await json(unlink)).data.user.google_email).toBeNull()
    expect(await membership(userId, 'maths')).toMatchObject({ status: 'pending', grades: [10] })
  })

  it('keeps password change teacher/admin-only for own shared credentials', async () => {
    const studentId = await seedUser({ phone: '+84900000111' })
    await seedMembership({ userId: studentId, workspaceId: 'maths', role: 'student', status: 'active' })
    const studentToken = await token('+84900000111')
    const forbidden = await request('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ current_password: '123', new_password: '456' }),
    })
    expect(forbidden.status).toBe(403)

    const adminId = await seedUser({ phone: '+84900000112', platformRole: 'platform_admin' })
    await seedMembership({ userId: adminId, workspaceId: 'maths', role: 'student', status: 'pending' })
    const adminToken = await token('+84900000112')
    const allowed = await request('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ current_password: '123', new_password: '456' }),
    })
    expect(allowed.status).toBe(200)
    expect((await json(await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000112', password: '456' }),
    }))).data.user.id).toBe(adminId)
  })

  it('denies globally disabled identity operations, including join', async () => {
    const userId = await seedUser({ phone: '+84900000113' })
    const auth = await token('+84900000113')
    await env.DB.prepare("update users set disabled_at = '2026-09-10T00:00:00Z' where id = ?").bind(userId).run()
    const join = await request('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ grades: [10] }),
    })
    expect(join.status).toBe(403)
    expect((await json(join)).error.code).toBe('ACCOUNT_DISABLED')
  })
})

describe('workspace auth Google callback checks', () => {
  it('rejects wrong-site callback before exchanging the Google code', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const res = await request('/api/auth/google/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(googleBody({ redirect_uri: 'http://english.test/auth/google/callback' })),
    })
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('INVALID_REDIRECT_URI')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 409 for linking a Google account already linked to another identity', async () => {
    await seedUser({ phone: '+84900000114', googleSub: 'taken-google' })
    const userId = await seedUser({ phone: '+84900000115' })
    await seedMembership({ userId, workspaceId: 'maths', status: 'pending' })
    const auth = await token('+84900000115')
    await setupGoogleMock({ sub: 'taken-google' })

    const res = await request('/api/auth/google/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify(googleBody()),
    })
    expect(res.status).toBe(409)
    const body = await json(res)
    expect(body.error.code).toBe('GOOGLE_SUB_TAKEN')
    expect(JSON.stringify(body)).not.toContain('taken-google')
  })
})
