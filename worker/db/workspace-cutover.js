const MARKER_SQL = `create table workspace_cutover (
  id integer primary key check (id = 1)
  , completed_at text not null default current_timestamp
)`

const TRIGGERS = ['exercises', 'lectures'].flatMap((table) => (
  ['insert', 'update'].map((operation) => {
    const name = `workspace_cutover_${table}_${operation}`
    return {
      name,
      sql: `create trigger ${name} before ${operation} on ${table}
        when new.workspace_id is null
        begin
          select raise(abort, 'workspace_id required');
        end`,
    }
  })
))

function fail(message) {
  throw new Error(`Workspace cutover refused: ${message}`)
}

async function rows(db, sql) {
  return (await db.prepare(sql).all()).results
}

async function hasValidOwnership(db) {
  const unowned = await db.prepare(`select
    (select count(*) from exercises where workspace_id is null)
    + (select count(*) from lectures where workspace_id is null) as count`).first()
  return unowned.count === 0 && (await rows(db, 'pragma foreign_key_check')).length === 0
}

// Compare projected tuples, retaining duplicates and value types but ignoring row order.
function assertSameRows(actual, expected, label) {
  const sorted = (values) => values.map((value) => JSON.stringify(value)).sort()
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(expected))) {
    fail(`${label} do not match reviewed mapping`)
  }
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Readiness is not a revalidation of the historical mapping after normal product writes. */
export async function getWorkspaceCutoverStatus(db) {
  const table = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'workspace_cutover'").first()
  if (!table || normalizeSql(table.sql) !== normalizeSql(MARKER_SQL)) return { complete: false }
  const markers = await rows(db, 'select id from workspace_cutover')
  if (markers.length !== 1 || markers[0].id !== 1) return { complete: false }
  const triggers = await rows(db, "select name, sql from sqlite_master where type = 'trigger'")
  if (!TRIGGERS.every((expected) => triggers.some((actual) => (
    actual.name === expected.name && normalizeSql(actual.sql) === normalizeSql(expected.sql)
  )))) return { complete: false }
  return { complete: await hasValidOwnership(db) }
}

/**
 * Caller must await backfillWorkspaces successfully and keep application maintenance closed
 * across all reads and the batch. This operation neither invokes backfill nor acquires a lock.
 * No data writes or postchecks follow the atomic trigger/marker batch.
 */
export async function finalizeWorkspaceCutover(db, mapping) {
  const reviewed = structuredClone(mapping)
  const marker = await db.prepare("select name from sqlite_master where name = 'workspace_cutover'").first()
  if (marker) fail('completion marker already exists; inspect before recovery')
  if (!reviewed || !['users', 'exercises', 'lectures'].every((key) => Array.isArray(reviewed[key]))) {
    fail('mapping must list users, exercises and lectures')
  }
  const memberships = []
  const grades = []
  for (const user of reviewed.users) {
    if (!user || !Array.isArray(user.memberships)) fail('user memberships must be an array')
    if (user.platform_role !== 'platform_admin' && user.memberships.length === 0) {
      fail('non-administrator user must have a membership')
    }
    for (const membership of user.memberships) {
      if (!membership || !Array.isArray(membership.grades)) fail('membership grades must be an array')
      if (membership.display_name !== null && typeof membership.display_name !== 'string') {
        fail('membership display_name must be an explicit string or null')
      }
      if ((membership.role === 'teacher' && membership.grades.length > 0)
        || (membership.role === 'student' && membership.status === 'active' && membership.grades.length === 0)) {
        fail('membership programmes are invalid')
      }
      memberships.push([user.id, membership.workspace_id, membership.role, membership.status, membership.access_tier, membership.display_name])
      grades.push(...membership.grades.map((grade) => [user.id, membership.workspace_id, grade]))
    }
  }
  assertSameRows(
    (await rows(db, 'select id, platform_role from users')).map((u) => [u.id, u.platform_role]),
    reviewed.users.map((u) => [u.id, u.platform_role]),
    'platform roles',
  )
  assertSameRows(
    (await rows(db, 'select user_id, workspace_id, role, status, access_tier, display_name from workspace_memberships'))
      .map((m) => [m.user_id, m.workspace_id, m.role, m.status, m.access_tier, m.display_name]),
    memberships,
    'memberships',
  )
  assertSameRows(
    (await rows(db, `select m.user_id, m.workspace_id, g.grade
      from workspace_membership_grades g join workspace_memberships m on m.id = g.membership_id`))
      .map((g) => [g.user_id, g.workspace_id, g.grade]),
    grades,
    'membership programmes',
  )
  for (const table of ['exercises', 'lectures']) {
    assertSameRows(
      (await rows(db, `select id, workspace_id from ${table}`)).map((r) => [r.id, r.workspace_id]),
      reviewed[table].map((r) => [r?.id, r?.workspace_id]),
      `${table} ownership`,
    )
  }
  if (!await hasValidOwnership(db)) fail('unowned content or foreign key corruption remains')
  await db.batch([
    ...TRIGGERS.map(({ sql }) => db.prepare(sql)),
    db.prepare(MARKER_SQL),
    db.prepare('insert into workspace_cutover (id) values (1)'),
  ])
  return { complete: true }
}
