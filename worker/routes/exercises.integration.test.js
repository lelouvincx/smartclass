import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import app from '../index.js'
import {
  seedTeacher,
  loginAsTeacher,
  createExercise,
  createStudentReadyExercise,
  seedStudent,
  loginAsStudent,
} from '../test/helpers.js'

let token

beforeAll(async () => {
  await seedTeacher()
  token = await loginAsTeacher()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Default helper schema: q_id=1 (mcq, B) + q_id=2 (boolean, a=1,b=0,c=0,d=1)
// That's 5 rows in answer_schemas but 2 distinct q_ids.

describe('GET /api/exercises', () => {
  it('returns empty list initially', async () => {
    const res = await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('counts distinct q_ids as question_count', async () => {
    await createExercise(token)
    const res = await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    const body = await res.json()
    // q_id 1 (mcq) + q_id 2 (boolean with 4 sub-rows) = 2 distinct questions
    const created = body.data.find((e) => e.title === 'Test Quiz')
    expect(created).toBeDefined()
    expect(created.question_count).toBe(2)
  })

  it('reports student readiness only for a confirmed active question asset set', async () => {
    const { id } = await createExercise(token, { title: 'Readiness Quiz' })
    const file = await env.DB.prepare(`
      insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
      values (?, 'exercise_pdf', ?, 'readiness.pdf', 100)
    `).bind(id, `exercises/${id}/readiness.pdf`).run()
    const pending = await env.DB.prepare(`
      insert into exercise_question_asset_sets (
        exercise_id, source_file_id, detector_version, detection_method
      ) values (?, ?, 'test-v1', 'text')
    `).bind(id, file.meta.last_row_id).run()

    await env.DB.prepare(
      'update exercises set active_question_asset_set_id = ? where id = ?'
    ).bind(pending.meta.last_row_id, id).run()

    let body = await (await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)).json()
    expect(body.data.find(exercise => exercise.id === id).is_student_ready).toBe(0)

    await env.DB.prepare(`
      update exercise_question_asset_sets
      set confirmed_by = (select id from users where role = 'teacher' limit 1),
          confirmed_at = current_timestamp
      where id = ?
    `).bind(pending.meta.last_row_id).run()

    body = await (await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)).json()
    expect(body.data.find(exercise => exercise.id === id).is_student_ready).toBe(1)
  })

  it('lists only ready exercises that overlap a student grade', async () => {
    const phone = '+84900000070'
    await seedStudent(phone, 'Grade List Student')
    const student = await env.DB.prepare(
      'SELECT id FROM users WHERE phone = ?',
    ).bind(phone).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)').bind(student.id),
    ])
    const studentToken = await loginAsStudent(phone)
    const matching = await createExercise(token, { title: 'Grade 10 and 11 quiz', grades: [10, 11] })
    const excluded = await createExercise(token, { title: 'Grade 12 quiz', grades: [12] })

    for (const exerciseId of [matching.id, excluded.id]) {
      const file = await env.DB.prepare(`
        INSERT INTO exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
        VALUES (?, 'exercise_pdf', ?, 'grade-list.pdf', 100)
      `).bind(exerciseId, `exercises/${exerciseId}/grade-list.pdf`).run()
      const assetSet = await env.DB.prepare(`
        INSERT INTO exercise_question_asset_sets (
          exercise_id, source_file_id, detector_version, detection_method,
          confirmed_by, confirmed_at
        ) VALUES (?, ?, 'test-v1', 'text',
          (SELECT id FROM users WHERE role = 'teacher' LIMIT 1), CURRENT_TIMESTAMP)
      `).bind(exerciseId, file.meta.last_row_id).run()
      await env.DB.prepare(
        'UPDATE exercises SET active_question_asset_set_id = ? WHERE id = ?',
      ).bind(assetSet.meta.last_row_id, exerciseId).run()
    }

    const response = await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)

    expect(response.status).toBe(200)
    const exercises = (await response.json()).data
    expect(exercises).toContainEqual(expect.objectContaining({
      id: matching.id,
      grades: [10, 11],
    }))
    expect(exercises.map((exercise) => exercise.id)).not.toContain(excluded.id)
  })

  it('lists an in-progress attempt after current grade access is removed', async () => {
    const phone = '+84900000074'
    await seedStudent(phone, 'Advancing List Student')
    const student = await env.DB.prepare(
      'SELECT id FROM users WHERE phone = ?',
    ).bind(phone).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)').bind(student.id),
    ])
    const studentToken = await loginAsStudent(phone)
    const exercise = await createStudentReadyExercise(token, {
      title: 'Grade 10 active attempt',
      grades: [10],
    })
    const submission = await env.DB.prepare(`
      INSERT INTO submissions (
        exercise_id, user_id, mode, total_questions, started_at, question_asset_set_id
      ) VALUES (?, ?, 'untimed', 2, CURRENT_TIMESTAMP, ?)
    `).bind(exercise.id, student.id, exercise.assetSetId).run()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 11)').bind(student.id),
    ])

    const response = await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: [expect.objectContaining({
        id: exercise.id,
        in_progress_submission_id: submission.meta.last_row_id,
      })],
    })
  })

  it('requires authentication', async () => {
    const res = await app.request('/api/exercises', {}, env)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/exercises', () => {
  it('creates exercise with valid schema including boolean sub-questions', async () => {
    const { res, body } = await createExercise(token)
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('Test Quiz')
    expect(body.data.is_timed).toBe(1)
    expect(body.data.duration_minutes).toBe(60)
    expect(body.data).not.toHaveProperty('extract_model')
    // 5 rows: 1 mcq + 4 boolean sub-rows
    expect(body.data.schema).toHaveLength(5)
    expect(body.data.files).toHaveLength(0)

    // Verify boolean sub-rows have sub_id
    const booleanRows = body.data.schema.filter((r) => r.type === 'boolean')
    expect(booleanRows).toHaveLength(4)
    expect(booleanRows.map((r) => r.sub_id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('creates untimed exercise with zero duration', async () => {
    const { res, body } = await createExercise(token, {
      is_timed: false,
      duration_minutes: 0,
    })

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.is_timed).toBe(0)
    expect(body.data.duration_minutes).toBe(0)
  })

  it('rejects string duration_minutes', async () => {
    const { res, body } = await createExercise(token, { duration_minutes: 'bad' })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects negative duration_minutes', async () => {
    const { res, body } = await createExercise(token, { duration_minutes: -5 })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects missing duration_minutes when exercise is timed', async () => {
    const { res, body } = await createExercise(token, {
      is_timed: true,
      duration_minutes: undefined,
    })

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects empty schema', async () => {
    const { res, body } = await createExercise(token, { schema: [] })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects invalid schema type', async () => {
    const { res, body } = await createExercise(token, {
      schema: [{ q_id: 1, type: 'invalid', correct_answer: 'A' }],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean row without sub_id', async () => {
    const { res, body } = await createExercise(token, {
      schema: [{ q_id: 1, type: 'boolean', correct_answer: '1' }],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean row with invalid sub_id', async () => {
    const { res, body } = await createExercise(token, {
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'e', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'c', correct_answer: '0' },
      ],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean row with answer other than 0 or 1', async () => {
    const { res, body } = await createExercise(token, {
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: 'true' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'c', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'd', correct_answer: '0' },
      ],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean question with incomplete sub-questions', async () => {
    const { res, body } = await createExercise(token, {
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        // missing c and d
      ],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('requires auth', async () => {
    const res = await app.request('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Auth', duration_minutes: 30, schema: [] }),
    }, env)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/exercises/:id', () => {
  it('returns exercise detail with files and schema', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(id)
    expect(body.data.schema).toHaveLength(5) // 1 mcq + 4 boolean sub-rows
    expect(body.data.files).toHaveLength(0)
    expect(body.data.is_student_ready).toBe(0)
  })

  it('returns 404 for non-existent exercise', async () => {
    const res = await app.request('/api/exercises/99999', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    expect(res.status).toBe(404)
  })

  it('includes correct_answer and sub_id in schema for teacher requests', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    const schema = body.data.schema
    expect(schema).toHaveLength(5)

    const mcqRow = schema.find((r) => r.type === 'mcq')
    expect(mcqRow).toMatchObject({ q_id: 1, type: 'mcq', correct_answer: 'B', sub_id: null })

    const boolRowA = schema.find((r) => r.type === 'boolean' && r.sub_id === 'a')
    expect(boolRowA).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1' })
  })

  it('requires authentication', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {}, env)
    expect(res.status).toBe(401)
  })

  it('strips correct_answer from schema for student requests', async () => {
    const studentPhone = '+84123456789'
    await seedStudent(studentPhone)
    const studentToken = await loginAsStudent(studentPhone)

    const { id } = await createStudentReadyExercise(token)

    const res = await app.request(`/api/exercises/${id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toHaveLength(5)
    expect(body.data.files).toEqual([])
    body.data.schema.forEach((row) => {
      expect(row).not.toHaveProperty('correct_answer')
    })

    const mcqRow = body.data.schema.find((r) => r.type === 'mcq')
    expect(mcqRow).toMatchObject({ q_id: 1, type: 'mcq', sub_id: null })

    const boolRowB = body.data.schema.find((r) => r.type === 'boolean' && r.sub_id === 'b')
    expect(boolRowB).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'b' })
  })

  it('returns grade memberships and blocks students without an overlapping grade', async () => {
    await seedStudent('+84900000071', 'Matching Student')
    await seedStudent('+84900000072', 'Excluded Student')
    const matchingStudent = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000071'",
    ).first()
    const excludedStudent = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000072'",
    ).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id IN (?, ?)')
        .bind(matchingStudent.id, excludedStudent.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)')
        .bind(matchingStudent.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 12)')
        .bind(excludedStudent.id),
    ])
    const matchingToken = await loginAsStudent('+84900000071')
    const excludedToken = await loginAsStudent('+84900000072')
    const { id, body } = await createStudentReadyExercise(token, { grades: [10, 11] })

    expect(body.data.grades).toEqual([10, 11])
    const matchingResponse = await app.request(`/api/exercises/${id}`, {
      headers: { Authorization: `Bearer ${matchingToken}` },
    }, env)
    expect(matchingResponse.status).toBe(200)

    const excludedResponse = await app.request(`/api/exercises/${id}`, {
      headers: { Authorization: `Bearer ${excludedToken}` },
    }, env)
    expect(excludedResponse.status).toBe(403)
    await expect(excludedResponse.json()).resolves.toMatchObject({
      error: { code: 'GRADE_ACCESS_DENIED' },
    })
  })

  it('blocks an unfinished exercise even when the student grade overlaps', async () => {
    const studentPhone = '+84900000075'
    await seedStudent(studentPhone, 'Unfinished Exercise Student')
    const studentToken = await loginAsStudent(studentPhone)
    const { id } = await createExercise(token, { grades: [10] })

    const response = await app.request(`/api/exercises/${id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'EXERCISE_NOT_READY' },
    })
  })

  it('keeps an in-progress attempt available after current grade access is removed', async () => {
    const studentPhone = '+84900000073'
    await seedStudent(studentPhone, 'Advancing Student')
    const student = await env.DB.prepare(
      'SELECT id FROM users WHERE phone = ?',
    ).bind(studentPhone).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)').bind(student.id),
    ])
    const studentToken = await loginAsStudent(studentPhone)
    const { id } = await createExercise(token, { grades: [10] })
    await env.DB.prepare(`
      INSERT INTO submissions (exercise_id, user_id, mode, total_questions, started_at)
      VALUES (?, ?, 'untimed', 2, CURRENT_TIMESTAMP)
    `).bind(id, student.id).run()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 11)').bind(student.id),
    ])

    const response = await app.request(`/api/exercises/${id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { in_progress_submission_id: expect.any(Number) },
    })
  })
})

describe('PUT /api/exercises/:id', () => {
  it('updates title', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'Updated Title' }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.title).toBe('Updated Title')
  })

  it('replaces and returns grade memberships', async () => {
    const { id } = await createExercise(token, { grades: [10] })
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ grades: [11, 12] }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.grades).toEqual([11, 12])
    const rows = await env.DB.prepare(`
      SELECT grade FROM exercise_grades WHERE exercise_id = ? ORDER BY grade
    `).bind(id).all()
    expect(rows.results.map((row) => row.grade)).toEqual([11, 12])
  })

  it('updates schema atomically', async () => {
    const { id } = await createExercise(token)
    const newSchema = [
      { q_id: 1, type: 'numeric', correct_answer: '42' },
    ]

    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ schema: newSchema }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toHaveLength(1)
    expect(body.data.schema[0].correct_answer).toBe('42')
  })

  it('preserves section descriptors omitted by an older client', async () => {
    const sectionedSchema = [
      { q_id: 1, section_key: 'multiple-choice', section_title: 'Phần I', local_number: 1, type: 'mcq', correct_answer: 'A' },
      { q_id: 2, section_key: 'written', section_title: 'Phần II', local_number: 1, type: 'numeric', correct_answer: '12' },
    ]
    const { id } = await createExercise(token, { schema: sectionedSchema })

    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        schema: sectionedSchema.map(({ q_id, type, correct_answer }) => ({ q_id, type, correct_answer })),
      }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toEqual(sectionedSchema.map((row) => ({ ...row, sub_id: null })))
  })

  it('rejects string duration_minutes on update', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ duration_minutes: 'invalid' }),
    }, env)

    expect(res.status).toBe(400)
  })

  it('forces duration_minutes to 0 when switching to untimed', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_timed: false }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.is_timed).toBe(0)
    expect(body.data.duration_minutes).toBe(0)
  })

  it('requires positive duration when switching untimed to timed', async () => {
    const { id } = await createExercise(token, {
      is_timed: false,
      duration_minutes: 0,
    })

    const invalidRes = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_timed: true }),
    }, env)

    expect(invalidRes.status).toBe(400)

    const validRes = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_timed: true, duration_minutes: 45 }),
    }, env)

    expect(validRes.status).toBe(200)
    const validBody = await validRes.json()
    expect(validBody.data.is_timed).toBe(1)
    expect(validBody.data.duration_minutes).toBe(45)
  })
})

describe('DELETE /api/exercises/:id', () => {
  it('deletes exercise and cascades to schema', async () => {
    const { id } = await createExercise(token)

    const deleteRes = await app.request(`/api/exercises/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)

    expect(deleteRes.status).toBe(200)
    const body = await deleteRes.json()
    expect(body.data.deleted).toBe(true)

    const getRes = await app.request(`/api/exercises/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    expect(getRes.status).toBe(404)

    const schemas = await env.DB.prepare(
      'SELECT * FROM answer_schemas WHERE exercise_id = ?'
    ).bind(id).all()
    expect(schemas.results).toHaveLength(0)
  })

  it('deletes exercise that has submissions (cascade)', async () => {
    await seedStudent('+84555666777')
    const { id } = await createExercise(token)
    const student = await env.DB.prepare(
      "select id from users where phone = '+84555666777'"
    ).first()
    const submission = await env.DB.prepare(`
      insert into submissions (exercise_id, user_id, mode, total_questions, started_at)
      values (?, ?, 'timed', 2, current_timestamp)
    `).bind(id, student.id).run()
    const submissionId = submission.meta.last_row_id
    await env.DB.prepare(`
      insert into submission_answers (submission_id, q_id, submitted_answer)
      values (?, 1, 'A')
    `).bind(submissionId).run()

    // Delete exercise should cascade
    const deleteRes = await app.request(`/api/exercises/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)

    expect(deleteRes.status).toBe(200)

    // Verify submissions are gone too
    const submissions = await env.DB.prepare(
      'SELECT * FROM submissions WHERE exercise_id = ?'
    ).bind(id).all()
    expect(submissions.results).toHaveLength(0)

    // Verify submission_answers are gone too
    const answers = await env.DB.prepare(
      'SELECT * FROM submission_answers WHERE submission_id = ?'
    ).bind(submissionId).all()
    expect(answers.results).toHaveLength(0)
  })

  it('returns 404 for non-existent exercise', async () => {
    const res = await app.request('/api/exercises/99999', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)
    expect(res.status).toBe(404)
  })
})

describe('GET /api/extract-models', () => {
  it('returns 404 after model selection removal', async () => {
    const res = await app.request('/api/extract-models', {}, env)
    expect(res.status).toBe(404)
  })
})

describe('removed exercise extraction model field', () => {
  it('rejects an update containing no supported field', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ extract_model: 'deepseek-v4-flash-vision-exp' }),
    }, env)

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })
})
