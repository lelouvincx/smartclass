import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyPassword } from '../lib/auth.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'
import { requireWorkspace } from '../middleware/workspace.js'
import workspaceUsersRoutes from './workspace-users.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

const app = new Hono()
app.use('/api/*', requireWorkspace)
app.route('/api/users', workspaceUsersRoutes)

function testEnv() {
  return {
    ...env,
    APP_ENV: 'test',
    JWT_SECRET: 'workspace-secret',
    JWT_EXPIRES_IN: '1h',
  }
}

function api(workspaceId, path, options = {}) {
  const host = workspaceId === 'english' ? 'english-api.test' : 'maths-api.test'
  return app.request(`http://${host}/api/users${path}`, options, testEnv())
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

async function seedUser({ id, name, phone, legacyRole = 'student', legacyStatus = 'active', accessTier = 'standard', platformRole = 'user', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, access_tier, platform_role, disabled_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, name, phone, PASSWORD_HASH, legacyRole, legacyStatus, accessTier, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId, role = 'student', status = 'active', accessTier = 'standard', displayName = null, grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier, display_name)
    values (?, ?, ?, ?, ?, ?)
  `).bind(workspaceId, userId, role, status, accessTier, displayName).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  }
  return result.meta.last_row_id
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from student_grades'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from lectures'),
    env.DB.prepare('delete from users'),
  ])
}

async function seedFixture() {
  await resetRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101', legacyRole: 'student' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102', legacyRole: 'student' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Platform Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Shared Mai', phone: '+84900000201', legacyRole: 'teacher' })
  await seedMembership({ userId: 201, workspaceId: 'maths', status: 'active', accessTier: 'vip', displayName: 'Maths Mai', grades: [12, 10] })
  await seedMembership({ userId: 201, workspaceId: 'english', status: 'active', accessTier: 'standard', displayName: 'English Mai', grades: [11] })
  await seedUser({ id: 202, name: 'Maths Pending', phone: '+84900000202' })
  await seedMembership({ userId: 202, workspaceId: 'maths', status: 'pending' })
  await seedUser({ id: 203, name: 'Maths Disabled', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', status: 'disabled', grades: [12] })
  await seedUser({ id: 204, name: 'English Only', phone: '+84900000204' })
  await seedMembership({ userId: 204, workspaceId: 'english', status: 'active', grades: [10] })
  await seedUser({ id: 205, name: 'Globally Blocked', phone: '+84900000205', disabledAt: '2026-09-10 00:00:00' })
  await seedMembership({ userId: 205, workspaceId: 'maths', status: 'active', grades: [10] })
  await seedUser({ id: 206, name: 'Membership Teacher', phone: '+84900000206' })
  await seedMembership({ userId: 206, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 207, name: 'Admin Student', phone: '+84900000207', platformRole: 'platform_admin' })
  await seedMembership({ userId: 207, workspaceId: 'maths', status: 'active', grades: [10] })
}

function jsonOptions(token, body, method = 'PUT') {
  return {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

let logSpy

beforeEach(async () => {
  logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  await seedFixture()
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('workspace user listing and target scope', () => {
  it('uses the current workspace membership, local display name, status filters, and admin tokens for both subjects', async () => {
    const mathsTeacher = await bearer(101, 'maths')
    const englishTeacher = await bearer(102, 'english')
    const adminMaths = await bearer(103, 'maths')
    const adminEnglish = await bearer(103, 'english')

    const mathsResponse = await api('maths', '', { headers: { Authorization: mathsTeacher } })
    expect(mathsResponse.status).toBe(200)
    const mathsRows = (await mathsResponse.json()).data
    expect(mathsRows).toContainEqual(expect.objectContaining({
      id: 201,
      name: 'Maths Mai',
      shared_name: 'Shared Mai',
      role: 'student',
      status: 'active',
      access_tier: 'vip',
      grades: [10, 12],
      globally_disabled: false,
    }))
    expect(mathsRows).toContainEqual(expect.objectContaining({ id: 205, globally_disabled: true }))
    expect(mathsRows).toContainEqual(expect.objectContaining({ id: 207, platform_role: 'platform_admin' }))
    expect(mathsRows).not.toContainEqual(expect.objectContaining({ id: 204 }))

    const englishResponse = await api('english', '', { headers: { Authorization: englishTeacher } })
    expect((await englishResponse.json()).data).toContainEqual(expect.objectContaining({
      id: 201,
      name: 'English Mai',
      access_tier: 'standard',
      grades: [11],
    }))

    expect((await api('maths', '?status=pending', { headers: { Authorization: adminMaths } })).status).toBe(200)
    expect((await api('english', '', { headers: { Authorization: adminEnglish } })).status).toBe(200)
    const invalidFilter = await api('maths', '?status=archived', { headers: { Authorization: mathsTeacher } })
    expect(invalidFilter.status).toBe(400)
    await expect(invalidFilter.json()).resolves.toMatchObject({ error: { code: 'INVALID_STATUS_FILTER' } })
  })

  it('rejects cross-domain direct targets, teacher-member targets, and legacy-role privilege confusion as scoped 404 or 403', async () => {
    const mathsTeacher = await bearer(101, 'maths')
    const studentWithLegacyTeacherRole = await bearer(201, 'maths')

    const foreign = await api('maths', '/204/name', jsonOptions(mathsTeacher, { name: 'Wrong' }))
    expect(foreign.status).toBe(404)
    const teacherMember = await api('maths', '/206/name', jsonOptions(mathsTeacher, { name: 'Wrong' }))
    expect(teacherMember.status).toBe(404)
    const studentGrant = await api('maths', '/grades', jsonOptions(studentWithLegacyTeacherRole, { student_ids: [201], grades: [10] }))
    expect(studentGrant.status).toBe(403)
    await expect(studentGrant.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } })
  })
})

describe('workspace user creation', () => {
  it('requires explicit programmes, creates only a new shared identity plus current membership, returns default password, and preserves legacy grade tables', async () => {
    const teacher = await bearer(101, 'maths')
    const missingGrades = await api('maths', '', jsonOptions(teacher, { name: 'No Grades', phone: '+84900000230' }, 'POST'))
    expect(missingGrades.status).toBe(400)

    const invalidPhone = await api('maths', '', jsonOptions(teacher, { name: 'Student', phone: ['+84900000230'], grades: [10] }, 'POST'))
    expect(invalidPhone.status).toBe(400)
    expect((await invalidPhone.json()).error.code).toBe('VALIDATION_ERROR')

    const createdResponse = await api('maths', '', jsonOptions(teacher, {
      name: '  New Student  ',
      phone: '0900000230',
      grades: [12, 'dgnl'],
      access_tier: 'vip',
    }, 'POST'))
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json()
    expect(created).toMatchObject({
      success: true,
      data: {
        name: 'New Student',
        shared_name: 'New Student',
        phone: '+84900000230',
        role: 'student',
        platform_role: 'user',
        status: 'active',
        access_tier: 'vip',
        grades: [12, 'dgnl'],
        defaultPassword: '123',
      },
    })
    const stored = await env.DB.prepare('select id, role, status, access_tier, password_hash from users where phone = ?').bind('+84900000230').first()
    expect(stored).toMatchObject({ role: 'student', status: 'active', access_tier: 'vip' })
    await expect(verifyPassword('123', stored.password_hash)).resolves.toBe(true)
    await expect(env.DB.prepare('select count(*) as count from student_grades where user_id = ?').bind(stored.id).first('count')).resolves.toBe(0)
    await expect(env.DB.prepare('select workspace_id, status from workspace_memberships where user_id = ?').bind(stored.id).first()).resolves.toEqual({ workspace_id: 'maths', status: 'active' })
  })

  it('returns PHONE_EXISTS for existing phones across sites without resetting password, name, or attaching membership', async () => {
    const teacher = await bearer(101, 'maths')
    const before = await env.DB.prepare('select name, password_hash from users where id = 204').first()
    const response = await api('maths', '', jsonOptions(teacher, { name: 'Attach Me', phone: '+84900000204', grades: [10] }, 'POST'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PHONE_EXISTS' } })
    await expect(env.DB.prepare('select name, password_hash from users where id = 204').first()).resolves.toEqual(before)
    await expect(env.DB.prepare("select count(*) as count from workspace_memberships where user_id = 204 and workspace_id = 'maths'").first('count')).resolves.toBe(0)
  })
})

describe('workspace user membership mutations', () => {
  it('bulk-updates grades and access tier atomically only when every target is a current workspace student membership', async () => {
    const teacher = await bearer(101, 'maths')
    const invalidGrades = await api('maths', '/grades', jsonOptions(teacher, { student_ids: [201, 204], grades: ['dgnl'] }))
    expect(invalidGrades.status).toBe(404)
    await expect(env.DB.prepare(`
      select grade from workspace_membership_grades
      where membership_id = (select id from workspace_memberships where workspace_id = 'maths' and user_id = 201)
      order by grade
    `).all()).resolves.toMatchObject({ results: [{ grade: 10 }, { grade: 12 }] })

    const grades = await api('maths', '/grades', jsonOptions(teacher, { student_ids: [201, 203], grades: ['dgnl'] }))
    expect(grades.status).toBe(200)
    await expect(grades.json()).resolves.toMatchObject({ data: { student_ids: [201, 203], grades: ['dgnl'] } })

    const invalidTier = await api('maths', '/access-tier', jsonOptions(teacher, { student_ids: [201, 204], access_tier: 'vip' }))
    expect(invalidTier.status).toBe(404)
    await expect(env.DB.prepare("select access_tier from workspace_memberships where workspace_id = 'maths' and user_id = 201").first('access_tier')).resolves.toBe('vip')

    const tier = await api('maths', '/access-tier', jsonOptions(teacher, { student_ids: [201, 203], access_tier: 'standard' }))
    expect(tier.status).toBe(200)
    await expect(env.DB.prepare("select access_tier from workspace_memberships where workspace_id = 'maths' and user_id = 201").first('access_tier')).resolves.toBe('standard')
  })

  it('updates only membership display name, disables only local membership, and preserves shared identity and attempts', async () => {
    const teacher = await bearer(101, 'maths')
    await env.DB.prepare("insert into exercises (id, title, duration_minutes, created_by, workspace_id) values (301, 'Quiz', 60, 101, 'maths')").run()
    await env.DB.prepare("insert into submissions (id, exercise_id, user_id, mode) values (401, 301, 201, 'timed')").run()

    const rename = await api('maths', '/201/name', jsonOptions(teacher, { name: '  Local Only  ' }))
    expect(rename.status).toBe(200)
    await expect(env.DB.prepare('select name from users where id = 201').first('name')).resolves.toBe('Shared Mai')
    await expect(env.DB.prepare("select display_name from workspace_memberships where workspace_id = 'maths' and user_id = 201").first('display_name')).resolves.toBe('Local Only')

    const remove = await api('maths', '/201', { method: 'DELETE', headers: { Authorization: teacher } })
    expect(remove.status).toBe(200)
    await expect(env.DB.prepare("select status from workspace_memberships where workspace_id = 'maths' and user_id = 201").first('status')).resolves.toBe('disabled')
    await expect(env.DB.prepare("select status from workspace_memberships where workspace_id = 'english' and user_id = 201").first('status')).resolves.toBe('active')
    await expect(env.DB.prepare('select user_id from submissions where id = 401').first('user_id')).resolves.toBe(201)
  })

  it('keeps programme assignment separate from approval and requires programmes before approval or reactivation', async () => {
    const teacher = await bearer(101, 'maths')

    const noProgrammeApprove = await api('maths', '/202/approve', { method: 'PUT', headers: { Authorization: teacher } })
    expect(noProgrammeApprove.status).toBe(400)
    await expect(noProgrammeApprove.json()).resolves.toMatchObject({ error: { code: 'PROGRAMMES_REQUIRED' } })

    const assign = await api('maths', '/grades', jsonOptions(teacher, { student_ids: [202], grades: [10] }))
    expect(assign.status).toBe(200)
    await expect(env.DB.prepare("select status from workspace_memberships where workspace_id = 'maths' and user_id = 202").first('status')).resolves.toBe('pending')

    const approve = await api('maths', '/202/approve', { method: 'PUT', headers: { Authorization: teacher } })
    expect(approve.status).toBe(200)
    await expect(approve.json()).resolves.toMatchObject({ data: { id: 202, status: 'active' } })

    await env.DB.prepare("delete from workspace_membership_grades where membership_id = (select id from workspace_memberships where workspace_id = 'maths' and user_id = 202)").run()
    await env.DB.prepare("update workspace_memberships set status = 'disabled' where workspace_id = 'maths' and user_id = 202").run()
    const reactivate = await api('maths', '/202/status', jsonOptions(teacher, { status: 'active' }))
    expect(reactivate.status).toBe(400)
    await expect(reactivate.json()).resolves.toMatchObject({ error: { code: 'PROGRAMMES_REQUIRED' } })

    const blockedActivation = await api('maths', '/205/status', jsonOptions(teacher, { status: 'active' }))
    expect(blockedActivation.status).toBe(403)
    await expect(blockedActivation.json()).resolves.toMatchObject({ error: { code: 'ACCOUNT_DISABLED' } })
  })
})

describe('global account status administration', () => {
  it('requires a platform admin, protects admin targets, blocks prior tokens across workspaces, and restore preserves membership state', async () => {
    const teacher = await bearer(101, 'maths')
    const admin = await bearer(103, 'maths')
    const studentMaths = await bearer(201, 'maths')
    const studentEnglish = await bearer(201, 'english')

    const nonAdmin = await api('maths', '/201/global-status', jsonOptions(teacher, { disabled: true }))
    expect(nonAdmin.status).toBe(403)
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({
      actor: 101, workspace: 'maths', target: 201, action: 'global_status', outcome: 403,
    }))

    const adminTarget = await api('maths', '/207/global-status', jsonOptions(admin, { disabled: true }))
    expect(adminTarget.status).toBe(403)
    const selfTarget = await api('maths', '/103/global-status', jsonOptions(admin, { disabled: true }))
    expect(selfTarget.status).toBe(403)

    const disable = await api('maths', '/201/global-status', jsonOptions(admin, { disabled: true }))
    expect(disable.status).toBe(200)
    await expect(disable.json()).resolves.toMatchObject({ data: { id: 201, globally_disabled: true } })
    for (const [site, token] of [['maths', studentMaths], ['english', studentEnglish]]) {
      const blocked = await api(site, '', { headers: { Authorization: token } })
      expect(blocked.status).toBe(403)
      expect((await blocked.json()).error.code).toBe('ACCOUNT_DISABLED')
    }

    await api('maths', '/201/global-status', jsonOptions(admin, { disabled: false }))
    const restored = await api('maths', '', { headers: { Authorization: studentMaths } })
    expect(restored.status).toBe(403)
    expect((await restored.json()).error.code).toBe('FORBIDDEN')

    await api('maths', '/203/global-status', jsonOptions(admin, { disabled: true }))
    await api('maths', '/203/global-status', jsonOptions(admin, { disabled: false }))
    await expect(env.DB.prepare("select status from workspace_memberships where workspace_id = 'maths' and user_id = 203").first('status')).resolves.toBe('disabled')
  })

  it('logs mutation metadata without names, phones, credentials, or answers', async () => {
    const teacher = await bearer(101, 'maths')
    const response = await api('maths', '/201/name', jsonOptions(teacher, { name: 'Private Name' }))
    expect(response.status).toBe(200)

    expect(logSpy).toHaveBeenCalled()
    const payload = JSON.parse(logSpy.mock.calls.at(-1)[0])
    expect(Object.keys(payload).sort()).toEqual(['action', 'actor', 'outcome', 'target', 'workspace'])
    expect(payload).toEqual({ actor: 101, workspace: 'maths', target: 201, action: 'update_display_name', outcome: 'success' })
    expect(JSON.stringify(payload)).not.toMatch(/Private|\+849|password|answer/i)
  })
})
