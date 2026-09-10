import { Hono } from 'hono'
import { hashPassword, isValidVietnamPhone, normalizeName, normalizePhone } from '../lib/auth.js'
import { attachGrades, parseGrades } from '../lib/grades.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireWorkspaceIdentity, requireWorkspaceManagement } from '../middleware/workspace-auth.js'

const workspaceUsersRoutes = new Hono()
const STUDENT_ACCESS_TIERS = new Set(['standard', 'vip'])
const STUDENT_STATUSES = new Set(['pending', 'active', 'disabled'])
const PROGRAMMES_REQUIRED_MESSAGE = 'Assign at least one programme before approving or activating this student.'

function currentWorkspaceId(c) {
  return c.get('workspace')?.id
}

function positiveId(value) {
  if (!/^\d+$/.test(value ?? '')) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function validateStudentIds(studentIds) {
  return Array.isArray(studentIds)
    && studentIds.length > 0
    && studentIds.every((id) => Number.isSafeInteger(id) && id > 0)
    && new Set(studentIds).size === studentIds.length
}

function programmesRequired(c) {
  return jsonError(c, 400, 'PROGRAMMES_REQUIRED', PROGRAMMES_REQUIRED_MESSAGE)
}

function boundedTarget(target) {
  if (!Array.isArray(target)) return target
  return { count: target.length, ids: target.slice(0, 20) }
}

function logMutation(c, target, action, outcome) {
  console.info(JSON.stringify({
    actor: c.get('authUser')?.id ?? null,
    workspace: currentWorkspaceId(c),
    target: boundedTarget(target),
    action,
    outcome,
  }))
}

async function studentMembership(c, userId) {
  return c.env.DB.prepare(`
    select
      users.id
      , users.name as shared_name
      , users.phone
      , users.platform_role
      , users.disabled_at
      , workspace_memberships.id as membership_id
      , workspace_memberships.role
      , workspace_memberships.status
      , workspace_memberships.access_tier
      , workspace_memberships.display_name
      , workspace_memberships.created_at
      , workspace_memberships.updated_at
    from workspace_memberships
    join users on users.id = workspace_memberships.user_id
    where workspace_memberships.workspace_id = ?
      and workspace_memberships.user_id = ?
      and workspace_memberships.role = 'student'
    limit 1
  `).bind(currentWorkspaceId(c), userId).first()
}

async function requireStudentMembership(c, userId) {
  const member = await studentMembership(c, userId)
  if (!member) {
    return { error: jsonError(c, 404, 'NOT_FOUND', 'Student membership not found.') }
  }
  return { member }
}

async function membershipsForBulk(c, studentIds) {
  const placeholders = studentIds.map(() => '?').join(', ')
  const result = await c.env.DB.prepare(`
    select users.id, workspace_memberships.id as membership_id
    from workspace_memberships
    join users on users.id = workspace_memberships.user_id
    where workspace_memberships.workspace_id = ?
      and workspace_memberships.role = 'student'
      and users.id in (${placeholders})
  `).bind(currentWorkspaceId(c), ...studentIds).all()

  if (result.results.length !== studentIds.length) return null
  return result.results
}

async function activateMemberWithProgrammes(c, membershipId) {
  return c.env.DB.prepare(`
    update workspace_memberships
    set status = 'active', updated_at = current_timestamp
    where id = ?
      and exists (
        select 1 from workspace_membership_grades
        where workspace_membership_grades.membership_id = workspace_memberships.id
      )
  `).bind(membershipId).run()
}

async function rowForMember(c, userId) {
  const rows = await c.env.DB.prepare(`
    select
      users.id
      , coalesce(workspace_memberships.display_name, users.name) as name
      , users.name as shared_name
      , users.phone
      , users.platform_role
      , workspace_memberships.role
      , workspace_memberships.status
      , workspace_memberships.access_tier
      , workspace_memberships.created_at
      , workspace_memberships.updated_at
      , case when users.disabled_at is null then 0 else 1 end as globally_disabled
    from workspace_memberships
    join users on users.id = workspace_memberships.user_id
    where workspace_memberships.workspace_id = ?
      and workspace_memberships.user_id = ?
      and workspace_memberships.role = 'student'
    limit 1
  `).bind(currentWorkspaceId(c), userId).all()

  const gradeRows = await c.env.DB.prepare(`
    select workspace_memberships.user_id, workspace_membership_grades.grade
    from workspace_membership_grades
    join workspace_memberships on workspace_memberships.id = workspace_membership_grades.membership_id
    where workspace_memberships.workspace_id = ? and workspace_memberships.user_id = ?
    order by workspace_membership_grades.grade
  `).bind(currentWorkspaceId(c), userId).all()

  const [row] = attachGrades(rows.results, gradeRows.results, 'user_id')
  return row ? { ...row, globally_disabled: Boolean(row.globally_disabled) } : null
}

workspaceUsersRoutes.use('*', requireWorkspaceIdentity, requireWorkspaceManagement)

workspaceUsersRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  if (status && !STUDENT_STATUSES.has(status)) {
    return jsonError(c, 400, 'INVALID_STATUS_FILTER', 'Status must be pending, active, or disabled.')
  }

  const params = [currentWorkspaceId(c)]
  let statusClause = ''
  if (status) {
    statusClause = 'and workspace_memberships.status = ?'
    params.push(status)
  }

  const result = await c.env.DB.prepare(`
    select
      users.id
      , coalesce(workspace_memberships.display_name, users.name) as name
      , users.name as shared_name
      , users.phone
      , users.platform_role
      , workspace_memberships.role
      , workspace_memberships.status
      , workspace_memberships.access_tier
      , workspace_memberships.created_at
      , workspace_memberships.updated_at
      , case when users.disabled_at is null then 0 else 1 end as globally_disabled
    from workspace_memberships
    join users on users.id = workspace_memberships.user_id
    where workspace_memberships.workspace_id = ?
      and workspace_memberships.role = 'student'
      ${statusClause}
    order by workspace_memberships.created_at desc, users.id desc
  `).bind(...params).all()

  const gradeResult = await c.env.DB.prepare(`
    select workspace_memberships.user_id, workspace_membership_grades.grade
    from workspace_membership_grades
    join workspace_memberships on workspace_memberships.id = workspace_membership_grades.membership_id
    where workspace_memberships.workspace_id = ?
    order by workspace_membership_grades.grade
  `).bind(currentWorkspaceId(c)).all()

  return jsonSuccess(c, attachGrades(result.results, gradeResult.results, 'user_id').map((row) => ({
    ...row,
    globally_disabled: Boolean(row.globally_disabled),
  })))
})

workspaceUsersRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = normalizeName(body?.name)
  const phone = normalizePhone(body?.phone)
  const parsedGrades = parseGrades(body?.grades)
  const accessTier = body?.access_tier === undefined ? 'standard' : body.access_tier

  if (!name || typeof phone !== 'string' || !phone) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Name and phone are required.')
  }
  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }
  if (!STUDENT_ACCESS_TIERS.has(accessTier)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'access_tier must be standard or vip.')
  }
  if (!isValidVietnamPhone(phone)) {
    return jsonError(c, 400, 'INVALID_PHONE', 'Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
  }

  const existingUser = await c.env.DB.prepare('select id from users where phone = ? limit 1').bind(phone).first()
  if (existingUser) {
    return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered. Ask the student to sign in and request access to this workspace.')
  }

  const defaultPassword = '123'
  const passwordHash = await hashPassword(defaultPassword)
  let userId
  try {
    const [userResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        insert into users (name, phone, password_hash, role, status, access_tier)
        values (?, ?, ?, 'student', 'active', ?)
      `).bind(name, phone, passwordHash, accessTier),
      c.env.DB.prepare(`
        insert into workspace_memberships (workspace_id, user_id, role, status, access_tier, display_name)
        select ?, id, 'student', 'active', ?, null from users where phone = ?
      `).bind(currentWorkspaceId(c), accessTier, phone),
      ...parsedGrades.grades.map((grade) => c.env.DB.prepare(`
        insert into workspace_membership_grades (membership_id, grade)
        select workspace_memberships.id, ?
        from workspace_memberships
        join users on users.id = workspace_memberships.user_id
        where workspace_memberships.workspace_id = ? and users.phone = ?
      `).bind(grade, currentWorkspaceId(c), phone)),
    ])
    userId = userResult.meta.last_row_id
  } catch (error) {
    if (error?.message?.includes('UNIQUE constraint failed: users.phone')) {
      return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered. Ask the student to sign in and request access to this workspace.')
    }
    throw error
  }

  logMutation(c, userId, 'create_student', 'success')
  return jsonSuccess(c, { ...(await rowForMember(c, userId)), defaultPassword }, 201)
})

workspaceUsersRoutes.put('/grades', async (c) => {
  const body = await c.req.json().catch(() => null)
  const studentIds = body?.student_ids
  const parsedGrades = parseGrades(body?.grades)
  if (!validateStudentIds(studentIds)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'student_ids must be a non-empty array of unique positive integers.')
  }
  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  const members = await membershipsForBulk(c, studentIds)
  if (!members) {
    return jsonError(c, 404, 'NOT_FOUND', 'Every target must be a student membership in this workspace.')
  }
  const membershipIds = members.map((member) => member.membership_id)
  const placeholders = membershipIds.map(() => '?').join(', ')

  await c.env.DB.batch([
    c.env.DB.prepare(`delete from workspace_membership_grades where membership_id in (${placeholders})`).bind(...membershipIds),
    ...membershipIds.flatMap((membershipId) => parsedGrades.grades.map((grade) => c.env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(membershipId, grade))),
    c.env.DB.prepare(`update workspace_memberships set updated_at = current_timestamp where id in (${placeholders})`).bind(...membershipIds),
  ])

  logMutation(c, studentIds, 'update_grades', 'success')
  return jsonSuccess(c, { student_ids: studentIds, grades: parsedGrades.grades })
})

workspaceUsersRoutes.put('/access-tier', async (c) => {
  const body = await c.req.json().catch(() => null)
  const studentIds = body?.student_ids
  const accessTier = body?.access_tier
  if (!validateStudentIds(studentIds)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'student_ids must be a non-empty array of unique positive integers.')
  }
  if (!STUDENT_ACCESS_TIERS.has(accessTier)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'access_tier must be standard or vip.')
  }

  const members = await membershipsForBulk(c, studentIds)
  if (!members) {
    return jsonError(c, 404, 'NOT_FOUND', 'Every target must be a student membership in this workspace.')
  }
  const membershipIds = members.map((member) => member.membership_id)
  const placeholders = membershipIds.map(() => '?').join(', ')
  await c.env.DB.batch([
    c.env.DB.prepare(`update workspace_memberships set access_tier = ?, updated_at = current_timestamp where id in (${placeholders})`).bind(accessTier, ...membershipIds),
  ])

  logMutation(c, studentIds, 'update_access_tier', 'success')
  return jsonSuccess(c, { student_ids: studentIds, access_tier: accessTier })
})

workspaceUsersRoutes.put('/:id/name', async (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')

  const { member, error } = await requireStudentMembership(c, id)
  if (error) return error
  const body = await c.req.json().catch(() => null)
  const name = normalizeName(body?.name)
  if (!name) return jsonError(c, 400, 'VALIDATION_ERROR', 'Name is required.')

  await c.env.DB.prepare(`
    update workspace_memberships set display_name = ?, updated_at = current_timestamp where id = ?
  `).bind(name, member.membership_id).run()

  logMutation(c, id, 'update_display_name', 'success')
  return jsonSuccess(c, { id, name })
})

workspaceUsersRoutes.delete('/:id', async (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')

  const { member, error } = await requireStudentMembership(c, id)
  if (error) return error
  if (member.status !== 'disabled') {
    await c.env.DB.prepare(`
      update workspace_memberships set status = 'disabled', updated_at = current_timestamp where id = ?
    `).bind(member.membership_id).run()
  }

  logMutation(c, id, 'disable_membership', 'success')
  return jsonSuccess(c, { id, removed: true })
})

workspaceUsersRoutes.put('/:id/status', async (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')

  const body = await c.req.json().catch(() => null)
  const status = body?.status
  if (!['active', 'disabled'].includes(status)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'status must be active or disabled.')
  }

  const { member, error } = await requireStudentMembership(c, id)
  if (error) return error
  if (status === 'active') {
    if (member.disabled_at !== null) {
      return jsonError(c, 403, 'ACCOUNT_DISABLED', 'This account has been disabled globally.')
    }
    const result = await activateMemberWithProgrammes(c, member.membership_id)
    if (result.meta.changes === 0) return programmesRequired(c)
  } else {
    await c.env.DB.prepare(`
      update workspace_memberships set status = ?, updated_at = current_timestamp where id = ?
    `).bind(status, member.membership_id).run()
  }

  logMutation(c, id, `set_status_${status}`, 'success')
  return jsonSuccess(c, { id, status })
})

workspaceUsersRoutes.put('/:id/approve', async (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')

  const { member, error } = await requireStudentMembership(c, id)
  if (error) return error
  if (member.disabled_at !== null) {
    return jsonError(c, 403, 'ACCOUNT_DISABLED', 'This account has been disabled globally.')
  }
  const result = await activateMemberWithProgrammes(c, member.membership_id)
  if (result.meta.changes === 0) return programmesRequired(c)

  logMutation(c, id, 'approve_membership', 'success')
  return jsonSuccess(c, { id, status: 'active' })
})

workspaceUsersRoutes.put('/:id/global-status', async (c, next) => {
  await next()
  logMutation(c, positiveId(c.req.param('id')), 'global_status', c.res.status)
}, async (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')

  const authUser = c.get('authUser')
  if (authUser?.platform_role !== 'platform_admin') {
    return jsonError(c, 403, 'FORBIDDEN', 'Only platform administrators can change global account status.')
  }
  if (authUser.id === id) {
    return jsonError(c, 403, 'FORBIDDEN', 'Platform administrator accounts cannot be disabled here.')
  }

  const { member, error } = await requireStudentMembership(c, id)
  if (error) return error
  if (member.platform_role === 'platform_admin') {
    return jsonError(c, 403, 'FORBIDDEN', 'Platform administrator accounts cannot be disabled here.')
  }

  const body = await c.req.json().catch(() => null)
  if (typeof body?.disabled !== 'boolean') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'disabled must be true or false.')
  }

  const result = await c.env.DB.prepare(`
    update users set disabled_at = case when ? then current_timestamp else null end
    where id = ? and platform_role = 'user'
  `).bind(body.disabled ? 1 : 0, id).run()
  if (result.meta.changes === 0) {
    return jsonError(c, 403, 'FORBIDDEN', 'Account status could not be changed.')
  }

  logMutation(c, id, body.disabled ? 'global_disable' : 'global_restore', 'success')
  return jsonSuccess(c, { id, globally_disabled: body.disabled })
})

export default workspaceUsersRoutes
