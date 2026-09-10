import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTeacherRouting,
  issueWorkspaceAccessToken,
} from '../lib/workspace-auth.js'
import { getWorkspaceSites } from '../lib/workspaces.js'
import { requireWorkspace } from './workspace.js'
import {
  optionalWorkspaceIdentity,
  requireWorkspaceIdentity,
  requireWorkspaceManagement,
  requireWorkspaceStudent,
} from './workspace-auth.js'

const WORKSPACE_SITES = getWorkspaceSites({ APP_ENV: 'production' })

function withWorkspace(workspaceId, ...handlers) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('workspace', WORKSPACE_SITES.find((site) => site.id === workspaceId) ?? { id: workspaceId })
    await next()
  })
  app.get('/probe', ...handlers)
  return app
}

function envFor(overrides = {}) {
  return {
    ...env,
    JWT_SECRET: 'workspace-secret',
    JWT_EXPIRES_IN: '1h',
    APP_ENV: 'production',
    ...overrides,
  }
}

async function request(app, token, requestEnv = envFor(), url = '/probe') {
  const headers = token === undefined ? {} : { Authorization: token }
  return app.request(url, { headers }, requestEnv)
}

async function requestWithOrigin(app, token, origin, url, requestEnv = envFor()) {
  const headers = token === undefined ? {} : { Authorization: token }
  if (origin !== undefined) headers.Origin = origin
  return app.request(url, { headers }, requestEnv)
}

async function bearer(userId, workspaceId, requestEnv = envFor()) {
  return `Bearer ${await issueWorkspaceAccessToken(requestEnv, userId, workspaceId)}`
}

async function rawToken(payload, secret = 'workspace-secret') {
  return sign(payload, secret, 'HS256')
}

async function clearWorkspaceAuthRows() {
  await env.DB.batch([
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from users'),
  ])
}

async function seedUser({ id, name, phone, legacyRole = 'student', legacyStatus = 'active', platformRole = 'user', disabledAt = null, email = null, googleEmail = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, email, google_email, password_hash, role, status, platform_role, disabled_at)
    values (?, ?, ?, ?, ?, 'hash', ?, ?, ?, ?)
  `).bind(id, name, phone, email, googleEmail, legacyRole, legacyStatus, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId, role, status = 'active', accessTier = 'standard', displayName = null, grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier, display_name)
    values (?, ?, ?, ?, ?, ?)
  `).bind(workspaceId, userId, role, status, accessTier, displayName).run()
  if (grades.length === 0) return
  await env.DB.batch(grades.map((grade) => env.DB.prepare(`
    insert into workspace_membership_grades (membership_id, grade)
    values (?, ?)
  `).bind(result.meta.last_row_id, grade)))
}

async function seedFixture() {
  await clearWorkspaceAuthRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101', legacyRole: 'student' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Platform Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Shared Student', phone: '+84900000201' })
  await seedMembership({ userId: 201, workspaceId: 'maths', role: 'student', accessTier: 'vip', displayName: 'Maths Mai', grades: [12, 10] })
  await seedMembership({ userId: 201, workspaceId: 'english', role: 'student', accessTier: 'standard', grades: [11] })
  await seedUser({ id: 202, name: 'Pending Student', phone: '+84900000202' })
  await seedMembership({ userId: 202, workspaceId: 'maths', role: 'student', status: 'pending' })
  await seedUser({ id: 203, name: 'Disabled Member', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', role: 'student', status: 'disabled', grades: [12] })
  await seedUser({ id: 204, name: 'No Member', phone: '+84900000204' })
  await seedUser({ id: 205, name: 'Globally Disabled', phone: '+84900000205', disabledAt: '2026-09-10 00:00:00' })
  await seedMembership({ userId: 205, workspaceId: 'maths', role: 'teacher' })
}

const identityHandler = (c) => c.json({
  authUser: c.get('authUser'),
  membership: c.get('workspaceMembership') ?? null,
  teacherRouting: c.get('teacherRouting'),
})

beforeEach(async () => {
  await seedFixture()
})

describe('workspace auth library', () => {
  it('issues minimal workspace tokens and rejects invalid inputs/configuration', async () => {
    const token = await issueWorkspaceAccessToken(envFor({ JWT_EXPIRES_IN: '30s' }), 201, 'maths')
    const [, payloadPart] = token.split('.')
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')))
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub', 'workspace_id'])
    expect(payload).toMatchObject({ sub: '201', workspace_id: 'maths' })
    expect(payload.exp - payload.iat).toBe(30)

    await expect(issueWorkspaceAccessToken(envFor(), 0, 'maths')).rejects.toThrow('invalid user id')
    await expect(issueWorkspaceAccessToken(envFor(), 1.2, 'maths')).rejects.toThrow('invalid user id')
    await expect(issueWorkspaceAccessToken(envFor(), 1, '')).rejects.toThrow('invalid workspace id')
    await expect(issueWorkspaceAccessToken(envFor({ JWT_SECRET: '' }), 1, 'maths')).rejects.toThrow('missing jwt secret')
  })

  it('does not route globally disabled teachers when disabled_at is non-null', () => {
    const account = {
      identity: { disabled_at: '', platform_role: 'user' },
      activeTeachingWorkspaceIds: ['english'],
    }
    expect(getTeacherRouting(account, 'maths', envFor())).toEqual({ action: 'stay' })
  })

  it('loads identity, current membership and active teaching workspaces without secrets or legacy authority', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    const res = await request(app, await bearer(201, 'maths'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.authUser).toEqual({
      id: 201,
      name: 'Shared Student',
      phone: '+84900000201',
      email: null,
      google_email: null,
      platform_role: 'user',
      disabled_at: null,
    })
    expect(body.authUser).not.toHaveProperty('role')
    expect(body.authUser).not.toHaveProperty('status')
    expect(body.membership).toMatchObject({ workspace_id: 'maths', role: 'student', status: 'active', access_tier: 'vip', display_name: 'Maths Mai', grades: [10, 12] })
  })
})

describe('requireWorkspaceIdentity', () => {
  it('requires resolved workspace context, secret config and exact bearer tokens', async () => {
    const noWorkspace = new Hono()
    noWorkspace.get('/probe', requireWorkspaceIdentity, identityHandler)
    expect((await request(noWorkspace, await bearer(201, 'maths'))).status).toBe(500)
    expect((await request(withWorkspace('maths', requireWorkspaceIdentity, identityHandler), await bearer(201, 'maths'), envFor({ JWT_SECRET: '' }))).status).toBe(500)
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    expect((await request(app, undefined)).status).toBe(401)
    expect((await request(app, 'bearer token')).status).toBe(401)
    expect((await request(app, 'Bearer ')).status).toBe(401)
  })

  it('rejects cross-workspace, numeric/absent subject, invalid timestamp, malformed and forged-role claims', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    const now = Math.floor(Date.now() / 1000)
    expect((await request(app, await bearer(201, 'english'))).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', iat: now, exp: now + 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ workspace_id: 'maths', iat: now, exp: now + 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: 201, workspace_id: 'maths', iat: now, exp: now + 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', workspace_id: 'maths', iat: now - 120, exp: now - 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', workspace_id: 'maths', exp: now + 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', workspace_id: 'maths', iat: now })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', workspace_id: 'maths', role: 'teacher', iat: now, exp: now + 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '0', workspace_id: 'maths', iat: now, exp: now + 60 })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', workspace_id: 'maths', iat: now + 60, exp: now })}`)).status).toBe(401)
    expect((await request(app, `Bearer ${await rawToken({ sub: '201', workspace_id: 'maths', iat: now + 60, exp: now + 120 })}`)).status).toBe(401)
    expect((await request(app, 'Bearer not-a-jwt')).status).toBe(401)
  })

  it('allows pending, disabled and no-membership identities but blocks global disables before context is set', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    for (const userId of [202, 203, 204]) {
      const res = await request(app, await bearer(userId, 'maths'))
      expect(res.status).toBe(200)
    }
    const disabled = await request(app, await bearer(205, 'maths'))
    expect(disabled.status).toBe(403)
    expect((await disabled.json()).error.code).toBe('ACCOUNT_DISABLED')
  })

  it('propagates database/downstream errors as 500 instead of false unauthorized', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    const failingEnv = envFor({ DB: { prepare: () => { throw new Error('database down') } } })
    const res = await request(app, await bearer(201, 'maths'), failingEnv)
    expect(res.status).toBe(500)
  })

  it('propagates downstream handler errors as 500 after identity is accepted', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, () => { throw new Error('downstream failed') })
    const res = await request(app, await bearer(201, 'maths'))
    expect(res.status).toBe(500)
  })
})

describe('workspace guards', () => {
  it('permits optional identity only when authorization is absent', async () => {
    const app = withWorkspace('maths', optionalWorkspaceIdentity, (c) => c.json({ authUser: c.get('authUser') ?? null }))
    expect((await request(app, undefined)).status).toBe(200)
    expect((await request(app, '')).status).toBe(401)
    expect((await request(app, 'Bearer ')).status).toBe(401)
    expect((await request(app, 'Basic abc')).status).toBe(401)
  })

  it('requires only c.get("workspace") and ignores the removed workspaceContext fallback', async () => {
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('workspaceContext', WORKSPACE_SITES.find((site) => site.id === 'maths'))
      await next()
    })
    app.get('/probe', requireWorkspaceIdentity, identityHandler)
    const res = await request(app, await bearer(201, 'maths'))
    expect(res.status).toBe(500)
  })

  it('requires active student membership for learning, independent of admin or legacy role', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, requireWorkspaceStudent, (c) => c.json({ ok: true }))
    expect((await request(app, await bearer(201, 'maths'))).status).toBe(200)
    expect((await request(app, await bearer(103, 'maths'))).status).toBe(403)
    expect((await request(app, await bearer(202, 'maths'))).status).toBe(403)
    expect((await request(app, await bearer(203, 'maths'))).status).toBe(403)
    expect((await request(app, await bearer(204, 'maths'))).status).toBe(403)
    await seedUser({ id: 206, name: 'Legacy Teacher Student', phone: '+84900000206', legacyRole: 'teacher' })
    await seedMembership({ userId: 206, workspaceId: 'maths', role: 'student', status: 'pending' })
    expect((await request(app, await bearer(206, 'maths'))).status).toBe(403)
  })

  it('permits management only for active current-workspace teachers or platform admins', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, requireWorkspaceManagement, (c) => c.json({ ok: true }))
    const teacherToken = await bearer(101, 'maths')
    const adminToken = await bearer(103, 'maths')
    const englishTeacherToken = await bearer(102, 'maths')
    const studentToken = await bearer(201, 'maths')

    expect((await request(app, teacherToken)).status).toBe(200)
    expect((await request(app, adminToken)).status).toBe(200)
    expect((await request(app, englishTeacherToken)).status).toBe(403)
    expect((await request(app, studentToken)).status).toBe(403)

    await env.DB.prepare("update users set platform_role = 'user' where id = 103").run()
    expect((await request(app, adminToken)).status).toBe(403)
    await env.DB.prepare("update workspace_memberships set status = 'disabled' where user_id = 101 and workspace_id = 'maths'").run()
    expect((await request(app, teacherToken)).status).toBe(403)
    await env.DB.prepare("update users set status = 'pending' where id = 101").run()
    await env.DB.prepare("update workspace_memberships set status = 'active' where user_id = 101 and workspace_id = 'maths'").run()
    expect((await request(app, teacherToken)).status).toBe(200)
  })

  it('uses live membership tier and global disabled changes with the same workspace tokens', async () => {
    const mathsApp = withWorkspace('maths', requireWorkspaceIdentity, requireWorkspaceStudent, (c) => c.json({ membership: c.get('workspaceMembership') }))
    const englishApp = withWorkspace('english', requireWorkspaceIdentity, requireWorkspaceStudent, (c) => c.json({ membership: c.get('workspaceMembership') }))
    const mathsToken = await bearer(201, 'maths')
    const englishToken = await bearer(201, 'english')

    let mathsBody = await (await request(mathsApp, mathsToken)).json()
    const englishBody = await (await request(englishApp, englishToken)).json()
    expect(mathsBody.membership).toMatchObject({ workspace_id: 'maths', access_tier: 'vip', grades: [10, 12] })
    expect(englishBody.membership).toMatchObject({ workspace_id: 'english', access_tier: 'standard', grades: [11] })

    await env.DB.prepare("update workspace_memberships set access_tier = 'standard' where user_id = 201 and workspace_id = 'maths'").run()
    mathsBody = await (await request(mathsApp, mathsToken)).json()
    expect(mathsBody.membership).toMatchObject({ workspace_id: 'maths', access_tier: 'standard', grades: [10, 12] })

    await env.DB.prepare("update workspace_memberships set status = 'disabled' where user_id = 201 and workspace_id = 'maths'").run()
    const mathsDenied = await request(mathsApp, mathsToken)
    expect(mathsDenied.status).toBe(403)
    expect((await mathsDenied.json()).error.code).toBe('MEMBERSHIP_DISABLED')
    expect((await request(englishApp, englishToken)).status).toBe(200)

    await env.DB.prepare("update users set disabled_at = '' where id = 201").run()
    for (const [app, token] of [[mathsApp, mathsToken], [englishApp, englishToken]]) {
      const denied = await request(app, token)
      expect(denied.status).toBe(403)
      expect((await denied.json()).error.code).toBe('ACCOUNT_DISABLED')
    }

    await env.DB.prepare('update users set disabled_at = null where id = 201').run()
    expect((await request(mathsApp, mathsToken)).status).toBe(403)
    expect((await request(englishApp, englishToken)).status).toBe(200)
  })
})

describe('workspace request boundary with identity', () => {
  it('keeps management and teacher destinations scoped through the real host resolver', async () => {
    const app = new Hono()
    app.use('/api/*', requireWorkspace)
    app.get('/api/me', requireWorkspaceIdentity, identityHandler)
    app.get('/api/manage', requireWorkspaceIdentity, requireWorkspaceManagement, identityHandler)
    for (const [workspace, origin, api, ownTeacher, otherTeacher, destination] of [
      ['maths', 'https://toanthaythanh.com', 'https://api.toanthaythanh.com', 101, 102, 'https://tienganhcothuy.com'],
      ['english', 'https://tienganhcothuy.com', 'https://api.tienganhcothuy.com', 102, 101, 'https://toanthaythanh.com'],
    ]) {
      for (const [userId, expectedStatus] of [[103, 200], [ownTeacher, 200], [otherTeacher, 403], [201, 403]]) {
        const response = await requestWithOrigin(app, await bearer(userId, workspace), origin, `${api}/api/manage`)
        expect(response.status).toBe(expectedStatus)
      }
      const otherToken = await bearer(otherTeacher, workspace)
      const response = await requestWithOrigin(app, otherToken, origin, `${api}/api/me`)
      expect((await response.json()).teacherRouting).toEqual({
        action: 'redirect',
        destinations: [{ workspace_id: workspace === 'maths' ? 'english' : 'maths', url: destination }],
      })
      const wrongWorkspaceToken = await bearer(103, workspace === 'maths' ? 'english' : 'maths')
      expect((await requestWithOrigin(app, wrongWorkspaceToken, origin, `${api}/api/manage`)).status).toBe(401)
    }
  })

  it('accepts exact production API hosts and matching origins before loading workspace identity', async () => {
    const app = new Hono()
    app.use('/api/*', requireWorkspace)
    app.get('/api/probe', requireWorkspaceIdentity, identityHandler)

    const maths = await requestWithOrigin(app, await bearer(201, 'maths'), 'https://toanthaythanh.com', 'https://api.toanthaythanh.com/api/probe')
    expect(maths.status).toBe(200)
    expect((await maths.json()).membership).toMatchObject({ workspace_id: 'maths', access_tier: 'vip', grades: [10, 12] })

    const english = await requestWithOrigin(app, await bearer(201, 'english'), 'https://tienganhcothuy.com', 'https://api.tienganhcothuy.com/api/probe')
    expect(english.status).toBe(200)
    expect((await english.json()).membership).toMatchObject({ workspace_id: 'english', access_tier: 'standard', grades: [11] })
  })
})

describe('teacher routing', () => {
  it('stays for current teacher, admins, students, disabled identities, and teachers with no active teaching workspace', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    expect((await (await request(app, await bearer(101, 'maths'))).json()).teacherRouting).toEqual({ action: 'stay' })
    expect((await (await request(app, await bearer(103, 'maths'))).json()).teacherRouting).toEqual({ action: 'stay' })
    expect((await (await request(app, await bearer(201, 'maths'))).json()).teacherRouting).toEqual({ action: 'stay' })
    await env.DB.prepare("update workspace_memberships set status = 'disabled' where user_id = 102 and workspace_id = 'english'").run()
    expect((await (await request(app, await bearer(102, 'maths'))).json()).teacherRouting).toEqual({ action: 'stay' })
  })

  it('redirects or asks teachers to choose only configured canonical origins, never caller URLs or tokens', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    let body = await (await request(app, await bearer(102, 'maths'))).json()
    expect(body.teacherRouting).toEqual({
      action: 'redirect',
      destinations: [{ workspace_id: 'english', url: 'https://tienganhcothuy.com' }],
    })
    await seedMembership({ userId: 102, workspaceId: 'maths', role: 'teacher' })
    body = await (await request(withWorkspace('science', requireWorkspaceIdentity, identityHandler), await bearer(102, 'science'))).json()
    expect(body.teacherRouting).toEqual({
      action: 'choose',
      destinations: [
        { workspace_id: 'english', url: 'https://tienganhcothuy.com' },
        { workspace_id: 'maths', url: 'https://toanthaythanh.com' },
      ],
    })
    expect(JSON.stringify(body.teacherRouting)).not.toContain('Bearer')
    expect(JSON.stringify(body.teacherRouting)).not.toContain('evil.example')
  })

  it('ignores adversarial WORKSPACE_SITES when choosing redirect destinations', async () => {
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    const body = await (await request(app, await bearer(102, 'maths'), envFor({
      WORKSPACE_SITES: [{ id: 'english', frontend_origin: 'https://evil.example' }],
    }))).json()
    expect(body.teacherRouting).toEqual({
      action: 'redirect',
      destinations: [{ workspace_id: 'english', url: 'https://tienganhcothuy.com' }],
    })
  })

  it('throws a configuration error rather than choosing an unknown active teaching workspace', async () => {
    await env.DB.prepare("insert into workspaces (id, slug, display_name, subject_code) values ('science', 'science', 'Science', 'science')").run()
    await seedMembership({ userId: 102, workspaceId: 'science', role: 'teacher' })
    const app = withWorkspace('maths', requireWorkspaceIdentity, identityHandler)
    const res = await request(app, await bearer(102, 'maths'))
    expect(res.status).toBe(500)
  })
})
