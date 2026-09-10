import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

function testEnv() {
  return { ...env, APP_ENV: 'test', JWT_SECRET: 'workspace-secret', JWT_EXPIRES_IN: '1h' }
}

function api(workspaceId, path, options = {}) {
  const host = workspaceId === 'english' ? 'english-api.test' : 'maths-api.test'
  return app.request(`http://${host}${path}`, options, testEnv())
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

async function seedUser({ id, name, phone, legacyRole = 'student', platformRole = 'user', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, platform_role, disabled_at)
    values (?, ?, ?, 'hash', ?, 'active', ?, ?)
  `).bind(id, name, phone, legacyRole, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId, role = 'student', status = 'active', grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values (?, ?, ?, ?, 'standard')
  `).bind(workspaceId, userId, role, status).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  }
}

async function seedExercise({ id, workspaceId, title }) {
  await env.DB.prepare(`
    insert into exercises (id, title, duration_minutes, created_by, workspace_id)
    values (?, ?, 45, 101, ?)
  `).bind(id, title, workspaceId).run()
  await env.DB.prepare('insert into exercise_grades (exercise_id, grade) values (?, 10)').bind(id).run()
}

async function seedFile({ exerciseId, type = 'exercise_pdf', name = 'source.pdf', content = 'pdf', contentType = 'application/pdf' }) {
  const r2Key = `exercises/${exerciseId}/${name}`
  await env.BUCKET.put(r2Key, content, { httpMetadata: { contentType } })
  const result = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, ?, ?, ?, ?)
  `).bind(exerciseId, type, r2Key, name, content.length).run()
  return { fileId: result.meta.last_row_id, r2Key }
}

async function activate(exerciseId, fileId, confirmed = true) {
  const set = await env.DB.prepare(`
    insert into exercise_question_asset_sets (
      exercise_id, source_file_id, detector_version, detection_method, confirmed_by, confirmed_at
    ) values (?, ?, 'test', 'text', ?, ${confirmed ? 'current_timestamp' : 'null'})
  `).bind(exerciseId, fileId, confirmed ? 101 : null).run()
  await env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = ?')
    .bind(set.meta.last_row_id, exerciseId).run()
  return set.meta.last_row_id
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from exercise_question_answer_assets'),
    env.DB.prepare('delete from exercise_question_assets'),
    env.DB.prepare('delete from exercise_question_asset_sets'),
    env.DB.prepare('delete from exercise_files'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from exercise_grades'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from users'),
  ])
}

beforeEach(async () => {
  await resetRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101', legacyRole: 'student' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102', legacyRole: 'student' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Shared Student', phone: '+84900000201', legacyRole: 'teacher' })
  await seedMembership({ userId: 201, workspaceId: 'maths', grades: [10] })
  await seedMembership({ userId: 201, workspaceId: 'english', grades: [11] })
  await seedUser({ id: 202, name: 'No Member', phone: '+84900000202' })
  await seedUser({ id: 203, name: 'Pending', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', status: 'pending', grades: [10] })
  await seedUser({ id: 204, name: 'Disabled', phone: '+84900000204' })
  await seedMembership({ userId: 204, workspaceId: 'maths', status: 'disabled', grades: [10] })
  await seedUser({ id: 205, name: 'Blocked', phone: '+84900000205', disabledAt: '2026-09-10 00:00:00' })
  await seedMembership({ userId: 205, workspaceId: 'maths', grades: [10] })
  await seedExercise({ id: 501, workspaceId: 'maths', title: 'Maths A' })
  await seedExercise({ id: 777, workspaceId: 'english', title: 'English B' })
})

describe('workspace file streaming', () => {
  it('keeps question images scoped and pinned access independent of later programme changes', async () => {
    const file = await seedFile({ exerciseId: 501 })
    const setId = await activate(501, file.fileId)
    const key = 'exercises/501/question.png'
    const bytes = new Uint8Array([1, 2, 3])
    await env.BUCKET.put(key, bytes)
    const image = await env.DB.prepare(`
      insert into exercise_question_assets (asset_set_id, q_id, segment_index, source_kind, r2_key, mime_type, file_size, pixel_width, pixel_height)
      values (?, 1, 0, 'teacher_screenshot', ?, 'image/png', 3, 1, 1)
    `).bind(setId, key).run()
    const path = `/api/question-assets/${image.meta.last_row_id}`
    const student = await bearer(201)
    const read = (site, token) => api(site, path, { headers: { Authorization: token } })
    expect(await (await read('maths', student)).arrayBuffer()).toEqual(bytes.buffer)
    for (const user of [102, 103, 201]) {
      expect((await read('english', await bearer(user, 'english'))).status).toBe(404)
    }
    await env.DB.prepare(`
      delete from workspace_membership_grades
      where membership_id = (select id from workspace_memberships where user_id = 201 and workspace_id = 'maths')
    `).run()
    expect((await read('maths', student)).status).toBe(403)
    // A corrupted pin to an exercise in another workspace must not grant access.
    await env.DB.prepare(`
      insert into submissions (exercise_id, user_id, mode, question_asset_set_id)
      values (777, 201, 'timed', ?)
    `).bind(setId).run()
    expect((await read('maths', student)).status).toBe(403)
    await env.DB.prepare(`
      insert into submissions (exercise_id, user_id, mode, question_asset_set_id)
      values (501, 201, 'timed', ?)
    `).bind(setId).run()
    await env.DB.prepare('update exercises set active_question_asset_set_id = null where id = 501').run()
    const pinned = await read('maths', student)
    expect(pinned.status).toBe(200)
    expect(pinned.headers.get('cache-control')).toBe('private, no-store')
    expect(await pinned.arrayBuffer()).toEqual(bytes.buffer)
    await env.DB.prepare("update workspace_memberships set status = 'disabled' where user_id = 201 and workspace_id = 'maths'").run()
    expect((await read('maths', student)).status).toBe(403)
    for (const user of [101, 103]) {
      const response = await read('maths', await bearer(user))
      expect(response.status).toBe(200)
      expect(await response.arrayBuffer()).toEqual(bytes.buffer)
    }
  })

  it('keeps answer images teacher-only in their owning workspace', async () => {
    const file = await seedFile({ exerciseId: 501 })
    const setId = await activate(501, file.fileId)
    const key = 'exercises/501/answer.png'
    await env.BUCKET.put(key, new Uint8Array([4, 5, 6]))
    const image = await env.DB.prepare(`
      insert into exercise_question_answer_assets (asset_set_id, q_id, segment_index, r2_key, mime_type, file_size, pixel_width, pixel_height)
      values (?, 1, 0, ?, 'image/png', 3, 1, 1)
    `).bind(setId, key).run()
    const path = `/api/question-assets/answer/${image.meta.last_row_id}`
    for (const user of [101, 103]) {
      const response = await api('maths', path, { headers: { Authorization: await bearer(user) } })
      expect(response.status).toBe(200)
      expect(await response.arrayBuffer()).toEqual(new Uint8Array([4, 5, 6]).buffer)
    }
    expect((await api('maths', path, { headers: { Authorization: await bearer(201) } })).status).toBe(403)
    for (const user of [102, 103]) {
      expect((await api('english', path, { headers: { Authorization: await bearer(user, 'english') } })).status).toBe(404)
    }
  })

  it('serves only the current active confirmed exercise PDF to students with current-workspace programme access', async () => {
    const { fileId } = await seedFile({ exerciseId: 501, content: 'maths pdf' })
    await activate(501, fileId)

    const res = await api('maths', `/api/files/${fileId}`, { headers: { Authorization: await bearer(201) } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toBe('inline')
    expect(await res.text()).toBe('maths pdf')

    const english = await api('english', `/api/files/${fileId}`, { headers: { Authorization: await bearer(201, 'english') } })
    expect(english.status).toBe(404)

    const { fileId: englishFileId } = await seedFile({ exerciseId: 777, content: 'english pdf' })
    await activate(777, englishFileId)
    const mismatchedProgramme = await api('english', `/api/files/${englishFileId}`, { headers: { Authorization: await bearer(201, 'english') } })
    expect(mismatchedProgramme.status).toBe(403)
    expect((await mismatchedProgramme.json()).error.code).toBe('GRADE_ACCESS_DENIED')
  })

  it('denies foreign IDs, non-exercise PDFs, incomplete active source, stale active-set relation and inactive identities before R2 access', async () => {
    const { fileId: sourceId } = await seedFile({ exerciseId: 501, content: 'active' })
    const { fileId: answerId } = await seedFile({ exerciseId: 501, type: 'solution_pdf', name: 'answer.pdf', content: 'answer' })
    const { fileId: foreignId } = await seedFile({ exerciseId: 777, content: 'english pdf' })
    await activate(501, sourceId)
    await activate(777, foreignId)

    expect((await api('maths', `/api/files/${foreignId}`, { headers: { Authorization: await bearer(101) } })).status).toBe(404)
    expect((await api('maths', `/api/files/${answerId}`, { headers: { Authorization: await bearer(201) } })).status).toBe(403)

    const { fileId: incompleteId, r2Key } = await seedFile({ exerciseId: 501, name: 'incomplete.pdf', content: 'incomplete' })
    await activate(501, incompleteId, false)
    expect((await api('maths', `/api/files/${incompleteId}`, { headers: { Authorization: await bearer(201) } })).status).toBe(403)
    expect(await (await env.BUCKET.get(r2Key)).text()).toBe('incomplete')

    await env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = 501').bind(await activate(777, foreignId)).run()
    expect((await api('maths', `/api/files/${sourceId}`, { headers: { Authorization: await bearer(201) } })).status).toBe(403)

    for (const userId of [202, 203, 204, 205]) {
      const token = await bearer(userId)
      expect((await api('maths', `/api/files/${sourceId}`, { headers: { Authorization: token } })).status).toBe(403)
    }
  })

  it('allows current workspace teachers and administrators to stream private PDFs without legacy role fields', async () => {
    const { fileId } = await seedFile({ exerciseId: 501, type: 'solution_pdf', name: 'answer.pdf', content: 'answer pdf' })
    const teacher = await api('maths', `/api/files/${fileId}`, { headers: { Authorization: await bearer(101) } })
    expect(teacher.status).toBe(200)
    expect(await teacher.text()).toBe('answer pdf')
    expect(await (await api('maths', `/api/files/${fileId}`, { headers: { Authorization: await bearer(103) } })).text()).toBe('answer pdf')
    expect((await api('maths', `/api/files/${fileId}`, { headers: { Authorization: await bearer(102) } })).status).toBe(403)
  })
})

describe('workspace upload preparation', () => {
  it('preserves streaming upload compatibility when a browser supplies a generic MIME type or extensionless name', async () => {
    const token = await bearer(101)
    const metadata = await api('maths', '/api/upload/exercises/501/files/upload', {
      method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'quiz' }),
    })
    expect(metadata.status).toBe(200)
    const { r2_key: key } = (await metadata.json()).data
    const uploaded = await api('maths', '/api/upload/exercises/501/files', {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/octet-stream', 'Content-Length': '8', 'x-r2-key': key, 'x-file-type': 'exercise_pdf', 'x-file-name': 'quiz' },
      body: new TextEncoder().encode('%PDF-1.4'),
    })
    expect(uploaded.status).toBe(200)
    expect(await (await env.BUCKET.get(key)).arrayBuffer()).toEqual(new TextEncoder().encode('%PDF-1.4').buffer)
  })

  it('returns existing upload metadata shape only for current-workspace management', async () => {
    const res = await api('maths', '/api/upload/exercises/501/files/upload', {
      method: 'POST',
      headers: { Authorization: await bearer(101), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'quiz.pdf' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ upload_url: '/api/upload/exercises/501/files', file_type: 'exercise_pdf', file_name: 'quiz.pdf' })
    expect(body.data.r2_key).toContain('exercises/501/')
    expect((await api('maths', '/api/upload/exercises/777/files/upload', {
      method: 'POST', headers: { Authorization: await bearer(101), 'Content-Type': 'application/json' }, body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'quiz.pdf' }),
    })).status).toBe(404)
  })

  it('validates upload metadata before R2 and DB writes and rejects foreign targets and forged keys', async () => {
    const token = await bearer(101)
    const metadata = await api('maths', '/api/upload/exercises/501/files/upload', {
      method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'quiz.pdf' }),
    })
    const { r2_key: r2Key } = (await metadata.json()).data
    const bytes = new TextEncoder().encode('%PDF-1.4').buffer
    const ok = await api('maths', '/api/upload/exercises/501/files', {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/pdf', 'Content-Length': '8', 'x-r2-key': r2Key, 'x-file-type': 'exercise_pdf', 'x-file-name': 'quiz.pdf' },
      body: bytes,
    })
    expect(ok.status).toBe(200)
    const okBody = await ok.json()
    expect(okBody.data).toMatchObject({ r2_key: r2Key, file_size: 8, uploaded: true })
    expect(await (await env.BUCKET.get(r2Key)).text()).toBe('%PDF-1.4')

    const beforeCount = (await env.DB.prepare('select count(*) as count from exercise_files').first()).count
    const foreignKey = 'exercises/777/protected.pdf'
    await env.BUCKET.put(foreignKey, new Uint8Array([7, 8, 9]))
    for (const [userId, exerciseId, key, status] of [
      [101, 777, foreignKey, 404],
      [103, 777, foreignKey, 404],
      [102, 501, 'exercises/501/denied.pdf', 403],
      [201, 501, 'exercises/501/denied.pdf', 403],
    ]) {
      const response = await api('maths', `/api/upload/exercises/${exerciseId}/files`, {
        method: 'PUT',
        headers: { Authorization: await bearer(userId), 'Content-Type': 'application/pdf', 'Content-Length': '8', 'x-r2-key': key, 'x-file-type': 'exercise_pdf', 'x-file-name': 'quiz.pdf' },
        body: bytes,
      })
      expect(response.status).toBe(status)
    }
    expect(await (await env.BUCKET.get(foreignKey)).arrayBuffer()).toEqual(new Uint8Array([7, 8, 9]).buffer)
    expect(await env.BUCKET.head('exercises/501/denied.pdf')).toBeNull()
    expect((await env.DB.prepare('select count(*) as count from exercise_files').first()).count).toBe(beforeCount)

    const forgedKey = 'exercises/777/forged.pdf'
    const forged = await api('maths', '/api/upload/exercises/501/files', {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/pdf', 'Content-Length': '8', 'x-r2-key': forgedKey, 'x-file-type': 'exercise_pdf', 'x-file-name': 'forged.pdf' },
      body: bytes,
    })
    expect(forged.status).toBe(400)
    expect(await env.BUCKET.get(forgedKey)).toBeNull()
    expect((await env.DB.prepare('select count(*) as count from exercise_files').first()).count).toBe(beforeCount)

    const badType = await api('maths', '/api/upload/exercises/501/files', {
      method: 'PUT',
      headers: { Authorization: token, 'Content-Type': 'application/pdf', 'Content-Length': '8', 'x-r2-key': 'exercises/501/bad.pdf', 'x-file-type': 'unknown', 'x-file-name': 'bad.pdf' },
      body: bytes,
    })
    expect(badType.status).toBe(400)
    expect(await env.BUCKET.get('exercises/501/bad.pdf')).toBeNull()
  })
})
