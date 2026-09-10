import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { backfillWorkspaces } from './workspace-backfill.js'
import { finalizeWorkspaceCutover, getWorkspaceCutoverStatus } from './workspace-cutover.js'

async function seed() {
  await env.DB.batch([
    env.DB.prepare(`insert into users (id, phone, password_hash, role, status, access_tier) values
      (101, '+84900101', 'synthetic', 'teacher', 'active', 'standard')
      , (102, '+84900102', 'synthetic', 'teacher', 'active', 'standard')
      , (201, '+84900201', 'synthetic', 'student', 'active', 'vip')
      , (202, '+84900202', 'synthetic', 'student', 'pending', 'standard')`),
    env.DB.prepare('insert into student_grades (user_id, grade) values (201, 10), (201, 12)'),
    env.DB.prepare(`insert into exercises (id, title, duration_minutes, created_by) values
      (301, 'One', 60, 101), (302, 'Two', 45, 101), (303, 'Three', 30, 101)`),
    env.DB.prepare(`insert into lectures (id, title, section_name, youtube_url, created_by) values
      (401, 'Four', 'A', 'https://youtu.be/test', 101)`),
  ])
  return {
    users: [
      { id: 101, platform_role: 'user', memberships: [{ workspace_id: 'maths', role: 'teacher', status: 'active', access_tier: 'standard', display_name: null, grades: [] }] },
      { id: 102, platform_role: 'platform_admin', memberships: [] },
      { id: 201, platform_role: 'user', memberships: [
        { workspace_id: 'maths', role: 'student', status: 'active', access_tier: 'vip', display_name: 'Local maths name', grades: [12, 10] },
        { workspace_id: 'english', role: 'student', status: 'disabled', access_tier: 'standard', display_name: null, grades: ['dgnl'] },
      ] },
      { id: 202, platform_role: 'user', memberships: [{ workspace_id: 'english', role: 'student', status: 'pending', access_tier: 'standard', display_name: '', grades: [] }] },
    ],
    exercises: [{ id: 301, workspace_id: 'maths' }, { id: 302, workspace_id: 'english' }, { id: 303, workspace_id: 'maths' }],
    lectures: [{ id: 401, workspace_id: 'english' }],
  }
}

describe('workspace cutover completion', () => {
  it('reports incomplete before the operational marker exists', async () => {
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
  })

  it('finalizes an uneven reviewed mapping without changing pending empty programmes or legacy state', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    const before = await env.DB.prepare('select * from users order by id').all()
    await expect(finalizeWorkspaceCutover(env.DB, mapping)).resolves.toEqual({ complete: true })
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: true })
    expect(await env.DB.prepare('select * from users order by id').all()).toMatchObject({ results: before.results })
    expect(await env.DB.prepare(`select status, display_name,
      (select count(*) from workspace_membership_grades where membership_id = m.id) as programmes
      from workspace_memberships m where user_id = 202`).first())
      .toEqual({ status: 'pending', display_name: '', programmes: 0 })
  })

  it('refuses premature finalization without creating a marker', async () => {
    const mapping = await seed()
    await expect(finalizeWorkspaceCutover(env.DB, mapping)).rejects.toThrow(/cutover refused/i)
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
  })

  it('compares exact reviewed rows, not matching aggregate counts', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    const mismatches = [
      (m) => { m.users[0].platform_role = 'platform_admin'; m.users[1].platform_role = 'user' },
      (m) => { m.users[2].memberships[0].role = 'teacher' },
      (m) => { m.users[2].memberships[0].status = 'disabled' },
      (m) => { m.users[2].memberships[0].access_tier = 'standard' },
      (m) => { m.users[3].memberships[0].display_name = null },
      (m) => { delete m.users[0].memberships[0].display_name },
      (m) => { m.users[2].memberships[0].grades = [11, 12] },
      (m) => { m.users[3].memberships[0].workspace_id = 'maths' },
      (m) => { m.users[3].memberships = [] },
      (m) => { m.users.push(m.users[0]) },
      (m) => { m.users[2].memberships.push(m.users[2].memberships[0]) },
      (m) => { m.users[2].memberships[0].grades.push(12) },
      (m) => { m.exercises[0].workspace_id = 'english'; m.exercises[1].workspace_id = 'maths' },
      (m) => { m.lectures[0].workspace_id = 'maths' },
      (m) => { m.exercises.pop() },
    ]
    for (const mutate of mismatches) {
      const reviewed = structuredClone(mapping)
      mutate(reviewed)
      await expect(finalizeWorkspaceCutover(env.DB, reviewed)).rejects.toThrow(/cutover refused/i)
      await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
    }
  })

  it('rejects unowned content even if the supplied mapping matches null ownership', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    await env.DB.prepare('update lectures set workspace_id = null where id = 401').run()
    mapping.lectures[0].workspace_id = null
    await expect(finalizeWorkspaceCutover(env.DB, mapping)).rejects.toThrow(/cutover refused/i)
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
  })

  it('rejects null ownership on both insert and update while allowing owned content', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    await finalizeWorkspaceCutover(env.DB, mapping)
    for (const sql of [
      "insert into exercises (title, duration_minutes, created_by) values ('Null', 30, 101)",
      "insert into lectures (title, section_name, youtube_url, created_by) values ('Null', 'A', 'https://youtu.be/test', 101)",
      'update exercises set workspace_id = null where id = 301',
      'update lectures set workspace_id = null where id = 401',
    ]) {
      await expect(env.DB.prepare(sql).run()).rejects.toThrow(/workspace_id required/i)
    }
    await env.DB.batch([
      env.DB.prepare("insert into exercises (title, duration_minutes, created_by, workspace_id) values ('Valid', 30, 101, 'english')"),
      env.DB.prepare("insert into lectures (title, section_name, youtube_url, created_by, workspace_id) values ('Valid', 'A', 'https://youtu.be/test', 101, 'maths')"),
      env.DB.prepare("update lectures set title = 'Still owned' where id = 401"),
    ])
    expect(await env.DB.prepare('select count(*) as n from exercises').first()).toEqual({ n: 4 })
    expect(await env.DB.prepare('select count(*) as n from lectures').first()).toEqual({ n: 2 })
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: true })
    await expect(env.DB.prepare('insert into workspace_cutover (id) values (2)').run()).rejects.toThrow()
  })

  it('rolls back all new triggers and the marker when a late batch statement fails', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    const db = {
      prepare: (...args) => env.DB.prepare(...args),
      batch: (statements) => env.DB.batch([
        ...statements,
        env.DB.prepare("insert into student_grades (user_id, grade) values (999999, 10)"),
      ]),
    }
    await expect(finalizeWorkspaceCutover(db, mapping)).rejects.toThrow()
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
    expect((await env.DB.prepare("select name from sqlite_master where name like 'workspace_cutover%'").all()).results).toEqual([])
    // A trigger installed outside the batch would make either statement fail.
    await env.DB.batch([
      env.DB.prepare('update exercises set workspace_id = null where id = 301'),
      env.DB.prepare('update lectures set workspace_id = null where id = 401'),
    ])
  })

  it('rejects repeat finalization without changing the completed state', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    await finalizeWorkspaceCutover(env.DB, mapping)
    await expect(finalizeWorkspaceCutover(env.DB, mapping)).rejects.toThrow(/already/i)
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: true })
  })

  it('does not trust a marker when an ownership trigger is missing or replaced', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    await finalizeWorkspaceCutover(env.DB, mapping)
    const trigger = await env.DB.prepare("select name from sqlite_master where type = 'trigger' and tbl_name = 'exercises' and name like 'workspace_cutover%'").first()
    await env.DB.prepare(`drop trigger ${trigger.name}`).run()
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
    await env.DB.prepare(`create trigger ${trigger.name} before insert on exercises begin select 1; end`).run()
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
  })

  it('checks current ownership even when marker and trigger definitions remain intact', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    await finalizeWorkspaceCutover(env.DB, mapping)
    const trigger = await env.DB.prepare("select name, sql from sqlite_master where name = 'workspace_cutover_lectures_update'").first()
    await env.DB.prepare(`drop trigger ${trigger.name}`).run()
    await env.DB.prepare('update lectures set workspace_id = null where id = 401').run()
    await env.DB.prepare(trigger.sql).run()
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
  })

  it('does not consider an empty marker table complete', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    await finalizeWorkspaceCutover(env.DB, mapping)
    await env.DB.prepare('delete from workspace_cutover').run()
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
    await expect(finalizeWorkspaceCutover(env.DB, mapping)).rejects.toThrow(/already/i)
  })

  it('fails closed if the foreign key check reports corruption', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    // Inject the integrity-check result; all other operations use real D1.
    const corrupt = {
      prepare: (sql) => sql === 'pragma foreign_key_check'
        ? { all: async () => ({ results: [{ table: 'submissions', rowid: 999, parent: 'users', fkid: 0 }] }) }
        : env.DB.prepare(sql),
      batch: (statements) => env.DB.batch(statements),
    }
    await expect(finalizeWorkspaceCutover(corrupt, mapping)).rejects.toThrow(/foreign key corruption/i)
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: false })
    await finalizeWorkspaceCutover(env.DB, mapping)
    await expect(getWorkspaceCutoverStatus(corrupt)).resolves.toEqual({ complete: false })
  })

  it('snapshots the reviewed mapping before any asynchronous database work', async () => {
    const mapping = await seed()
    await backfillWorkspaces(env.DB, mapping)
    const db = {
      prepare: (sql) => {
        mapping.exercises[0].workspace_id = 'english'
        return env.DB.prepare(sql)
      },
      batch: (statements) => env.DB.batch(statements),
    }
    await expect(finalizeWorkspaceCutover(db, mapping)).resolves.toEqual({ complete: true })
    await expect(getWorkspaceCutoverStatus(env.DB)).resolves.toEqual({ complete: true })
  })
})
