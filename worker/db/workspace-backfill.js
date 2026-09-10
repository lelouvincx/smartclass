const USER_PLATFORM_ROLES = new Set(['user', 'platform_admin'])
const MEMBERSHIP_ROLES = new Set(['teacher', 'student'])
const MEMBERSHIP_STATUSES = new Set(['pending', 'active', 'disabled'])
const ACCESS_TIERS = new Set(['standard', 'vip'])
const GRADES = new Set([10, 11, 12, 'dgnl'])

function fail(message) {
  throw new Error(`Workspace backfill refused: ${message}`)
}

function assertArray(value, name) {
  if (!Array.isArray(value)) fail(`${name} must be an array`)
}

function assertInteger(value, name) {
  if (!Number.isInteger(value)) fail(`${name} must be an integer`)
}

function normalizeIdSet(rows) {
  return rows.map((row) => row.id).sort((left, right) => left - right)
}

function assertIdsExactlyOnce(manifestRows, existingIds, label) {
  const seen = new Set()
  const ids = []
  for (const row of manifestRows) {
    assertInteger(row?.id, `${label} id`)
    if (seen.has(row.id)) fail(`duplicate ${label} id ${row.id}`)
    seen.add(row.id)
    ids.push(row.id)
  }
  ids.sort((left, right) => left - right)
  if (ids.length !== existingIds.length || ids.some((id, index) => id !== existingIds[index])) {
    fail(`manifest must include existing ${label} ids exactly once`)
  }
}

function sortedGrades(grades) {
  return [...grades].sort((left, right) => String(left).localeCompare(String(right)))
}

function sameGradeSet(left, right) {
  const leftGrades = sortedGrades(left)
  const rightGrades = sortedGrades(right)
  return leftGrades.length === rightGrades.length
    && leftGrades.every((grade, index) => grade === rightGrades[index])
}

function validateMembership(user, membership, knownWorkspaceIds, index) {
  if (!membership || typeof membership !== 'object') {
    fail(`user ${user.id} membership ${index} must be an object`)
  }
  if (!knownWorkspaceIds.has(membership.workspace_id)) {
    fail(`user ${user.id} membership ${index} references unknown workspace`)
  }
  if (!MEMBERSHIP_ROLES.has(membership.role)) {
    fail(`user ${user.id} membership ${index} has invalid role`)
  }
  if (!MEMBERSHIP_STATUSES.has(membership.status)) {
    fail(`user ${user.id} membership ${index} has invalid status`)
  }
  if (!ACCESS_TIERS.has(membership.access_tier)) {
    fail(`user ${user.id} membership ${index} has invalid access tier`)
  }
  if (membership.display_name !== null && typeof membership.display_name !== 'string') {
    fail(`user ${user.id} membership ${index} has invalid display name`)
  }
  assertArray(membership.grades, `user ${user.id} membership ${index} grades`)
  const gradeSet = new Set()
  for (const grade of membership.grades) {
    if (!GRADES.has(grade)) fail(`user ${user.id} membership ${index} has invalid grade`)
    if (gradeSet.has(grade)) fail(`user ${user.id} membership ${index} has duplicate grade`)
    gradeSet.add(grade)
  }
  if (membership.role === 'teacher' && membership.grades.length > 0) {
    fail(`teacher membership for user ${user.id} cannot have grades`)
  }
  if (membership.role === 'student' && membership.status === 'active' && membership.grades.length === 0) {
    fail(`active student membership for user ${user.id} must have at least one grade`)
  }
}

async function queryAll(db, sql, ...bindings) {
  return (await db.prepare(sql).bind(...bindings).all()).results
}

async function queryFirst(db, sql, ...bindings) {
  return db.prepare(sql).bind(...bindings).first()
}

async function assertSafeStartingState(db) {
  const foreignKeyRows = await queryAll(db, 'pragma foreign_key_check')
  if (foreignKeyRows.length > 0) fail('existing foreign key corruption must be repaired before backfill')

  const unsafe = await queryFirst(db, `
    select
      (select count(*) from workspace_memberships) as memberships
      , (select count(*) from exercises where workspace_id is not null) as owned_exercises
      , (select count(*) from lectures where workspace_id is not null) as owned_lectures
      , (select count(*) from users where platform_role <> 'user' or disabled_at is not null) as nondefault_users
  `)
  if (unsafe.memberships > 0 || unsafe.owned_exercises > 0 || unsafe.owned_lectures > 0) {
    fail('workspace memberships or content ownership are already populated')
  }
  if (unsafe.nondefault_users > 0) {
    fail('nondefault platform/global user state is already present')
  }
}

function validateManifestShape(mapping) {
  if (!mapping || typeof mapping !== 'object') fail('mapping must be an object')
  assertArray(mapping.users, 'mapping.users')
  assertArray(mapping.exercises, 'mapping.exercises')
  assertArray(mapping.lectures, 'mapping.lectures')
}

function validateUsers({ manifestUsers, existingUsers, legacyGradeMap, workspaceIds }) {
  const existingUserById = new Map(existingUsers.map((user) => [user.id, user]))
  for (const user of manifestUsers) {
    if (!USER_PLATFORM_ROLES.has(user?.platform_role)) {
      fail(`user ${user?.id ?? '(missing)'} has invalid platform role`)
    }
    assertArray(user.memberships, `user ${user.id} memberships`)

    const existingUser = existingUserById.get(user.id)
    if (!existingUser) fail(`user ${user.id} is not an existing user`)
    const membershipWorkspaces = new Set()
    for (let index = 0; index < user.memberships.length; index += 1) {
      const membership = user.memberships[index]
      validateMembership(user, membership, workspaceIds, index)
      if (membershipWorkspaces.has(membership.workspace_id)) {
        fail(`user ${user.id} has duplicate membership for workspace ${membership.workspace_id}`)
      }
      membershipWorkspaces.add(membership.workspace_id)
    }

    if (user.platform_role !== 'platform_admin' && user.memberships.length === 0) {
      fail(`user ${user.id} must have a membership unless explicitly platform_admin`)
    }

    if (existingUser.role === 'student') {
      const legacyGrades = legacyGradeMap.get(user.id) ?? []
      const preservesLegacyAccess = user.memberships.some((membership) => (
        membership.role === 'student'
        && membership.status === existingUser.status
        && membership.access_tier === existingUser.access_tier
        && sameGradeSet(membership.grades, legacyGrades)
      ))
      if (!preservesLegacyAccess) {
        fail(`student user ${user.id} must preserve original role, status, tier and programmes in at least one membership`)
      }
    }
  }
}

function validateContent(manifestRows, workspaceIds, label) {
  for (const row of manifestRows) {
    if (!workspaceIds.has(row?.workspace_id)) {
      fail(`${label} ${row?.id ?? '(missing)'} references unknown workspace`)
    }
  }
}

async function validateManifest(db, mapping) {
  validateManifestShape(mapping)
  const [workspaceRows, existingUsers, exerciseRows, lectureRows, legacyGradeRows] = await Promise.all([
    queryAll(db, 'select id from workspaces order by id'),
    queryAll(db, 'select id, role, status, access_tier from users order by id'),
    queryAll(db, 'select id from exercises order by id'),
    queryAll(db, 'select id from lectures order by id'),
    queryAll(db, 'select user_id, grade from student_grades order by user_id, grade'),
  ])
  const workspaceIds = new Set(workspaceRows.map((row) => row.id))
  const legacyGradeMap = new Map()
  for (const row of legacyGradeRows) {
    if (!legacyGradeMap.has(row.user_id)) legacyGradeMap.set(row.user_id, [])
    legacyGradeMap.get(row.user_id).push(row.grade)
  }

  assertIdsExactlyOnce(mapping.users, normalizeIdSet(existingUsers), 'user')
  assertIdsExactlyOnce(mapping.exercises, normalizeIdSet(exerciseRows), 'exercise')
  assertIdsExactlyOnce(mapping.lectures, normalizeIdSet(lectureRows), 'lecture')
  validateUsers({ manifestUsers: mapping.users, existingUsers, legacyGradeMap, workspaceIds })
  validateContent(mapping.exercises, workspaceIds, 'exercise')
  validateContent(mapping.lectures, workspaceIds, 'lecture')
}

function buildStatements(db, mapping) {
  const statements = []
  for (const user of mapping.users) {
    statements.push(
      db.prepare('update users set platform_role = ? where id = ?').bind(user.platform_role, user.id),
    )
    for (const membership of user.memberships) {
      statements.push(db.prepare(`
        insert into workspace_memberships (
          workspace_id, user_id, role, status, access_tier, display_name
        ) values (?, ?, ?, ?, ?, ?)
      `).bind(
        membership.workspace_id,
        user.id,
        membership.role,
        membership.status,
        membership.access_tier,
        membership.display_name,
      ))
      for (const grade of membership.grades) {
        statements.push(db.prepare(`
          insert into workspace_membership_grades (membership_id, grade)
          select id, ?
          from workspace_memberships
          where workspace_id = ? and user_id = ?
        `).bind(grade, membership.workspace_id, user.id))
      }
    }
  }
  for (const exercise of mapping.exercises) {
    statements.push(
      db.prepare('update exercises set workspace_id = ? where id = ?').bind(exercise.workspace_id, exercise.id),
    )
  }
  for (const lecture of mapping.lectures) {
    statements.push(
      db.prepare('update lectures set workspace_id = ? where id = ?').bind(lecture.workspace_id, lecture.id),
    )
  }
  return statements
}

async function assertBackfilledIntegrity(db, mapping) {
  const foreignKeyRows = await queryAll(db, 'pragma foreign_key_check')
  if (foreignKeyRows.length > 0) fail('backfill produced foreign key corruption')

  const counts = await queryFirst(db, `
    select
      (select count(*) from users where platform_role = 'platform_admin') as platform_admins
      , (select count(*) from workspace_memberships) as memberships
      , (select count(*) from workspace_membership_grades) as membership_grades
      , (select count(*) from exercises where workspace_id is null) as unowned_exercises
      , (select count(*) from lectures where workspace_id is null) as unowned_lectures
  `)
  const expectedAdmins = mapping.users.filter((user) => user.platform_role === 'platform_admin').length
  const expectedMemberships = mapping.users.reduce((total, user) => total + user.memberships.length, 0)
  const expectedGrades = mapping.users.reduce(
    (total, user) => total + user.memberships.reduce((membershipTotal, membership) => membershipTotal + membership.grades.length, 0),
    0,
  )
  if (counts.platform_admins !== expectedAdmins) fail('platform administrator count does not match mapping')
  if (counts.memberships !== expectedMemberships) fail('membership count does not match mapping')
  if (counts.membership_grades !== expectedGrades) fail('membership programme count does not match mapping')
  if (counts.unowned_exercises !== 0 || counts.unowned_lectures !== 0) {
    fail('content ownership remains incomplete after backfill')
  }
}

/**
 * Backfills reviewed workspace ownership and memberships while maintenance mode is closed.
 *
 * Keeping application maintenance enabled with no competing deployment or writer across reads, the batch, and
 * postcheck reads is a caller precondition. Postcheck failures cannot roll back already committed
 * batch writes; if a postcheck fails, keep maintenance closed until the database is repaired or the
 * migration is completed. The caller has already verified the admin/password prerequisite.
 */
export async function backfillWorkspaces(db, mapping) {
  const reviewedMapping = structuredClone(mapping)
  await assertSafeStartingState(db)
  await validateManifest(db, reviewedMapping)
  await db.batch(buildStatements(db, reviewedMapping))
  await assertBackfilledIntegrity(db, reviewedMapping)
}
