import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import app from '../index.js'
import {
  createStudentReadyExercise,
  loginAsStudent,
  loginAsTeacher,
  seedStudent,
  seedTeacher,
} from '../test/helpers.js'

let teacherToken
let studentToken

beforeAll(async () => {
  await seedTeacher()
  await seedStudent()
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent()
})

function startAttempt(exerciseId, payload = {}, token = studentToken) {
  return app.request('/api/submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      exercise_id: exerciseId,
      known_latest_attempt_number: 0,
      ...payload,
    }),
  }, env)
}

async function submitAttempt(submissionId, token = studentToken) {
  return app.request(`/api/submissions/${submissionId}/submit`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ answers: [] }),
  }, env)
}

describe('RFC-14 expand migration', () => {
  it('deterministically numbers legacy rows by effective start time, creation time, and id', async () => {
    const firstExercise = await createStudentReadyExercise(teacherToken, { max_attempts: null })
    const secondExercise = await createStudentReadyExercise(teacherToken, { max_attempts: null })
    const student = await env.DB.prepare(
      "select id from users where phone = '+84123456789'",
    ).first()
    const teacher = await env.DB.prepare(
      "select id from users where phone = '+84865481769'",
    ).first()
    await env.DB.prepare('drop trigger submissions_assign_attempt_number_compat').run()

    const insertLegacy = (exerciseId, userId, startedAt, createdAt) => env.DB.prepare(`
      insert into submissions (
        exercise_id, user_id, mode, started_at, created_at, attempt_number
      ) values (?, ?, 'untimed', ?, ?, null)
    `).bind(exerciseId, userId, startedAt, createdAt).run()
    const studentFirstA = await insertLegacy(
      firstExercise.id, student.id, null, '2026-09-05 08:00:00',
    )
    const studentFirstB = await insertLegacy(
      firstExercise.id, student.id, '2026-09-05 07:00:00', '2026-09-05 09:00:00',
    )
    const studentFirstC = await insertLegacy(
      firstExercise.id, student.id, null, '2026-09-05 08:00:00',
    )
    const studentSecond = await insertLegacy(
      secondExercise.id, student.id, null, '2026-09-05 06:00:00',
    )
    const teacherFirst = await insertLegacy(
      firstExercise.id, teacher.id, null, '2026-09-05 06:00:00',
    )

    await env.DB.prepare(`
      with ranked as (
        select
          id
          , row_number() over (
              partition by user_id, exercise_id
              order by coalesce(started_at, created_at), created_at, id
            ) as attempt_number
        from submissions
        where user_id is not null
      )
      update submissions
      set attempt_number = (
        select ranked.attempt_number
        from ranked
        where ranked.id = submissions.id
      )
      where user_id is not null
    `).run()

    const rows = await env.DB.prepare(`
      select id, attempt_number from submissions order by id
    `).all()
    const attemptsById = new Map(rows.results.map(row => [row.id, row.attempt_number]))
    expect(attemptsById.get(studentFirstB.meta.last_row_id)).toBe(1)
    expect(attemptsById.get(studentFirstA.meta.last_row_id)).toBe(2)
    expect(attemptsById.get(studentFirstC.meta.last_row_id)).toBe(3)
    expect(attemptsById.get(studentSecond.meta.last_row_id)).toBe(1)
    expect(attemptsById.get(teacherFirst.meta.last_row_id)).toBe(1)
  })

  it('numbers old Worker inserts and enforces authenticated attempt identity', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: null })
    const student = await env.DB.prepare(
      "select id from users where phone = '+84123456789'",
    ).first()

    await env.DB.prepare(`
      insert into submissions (exercise_id, user_id, mode, started_at)
      values (?, ?, 'untimed', '2026-09-05 09:00:00')
    `).bind(exercise.id, student.id).run()
    await env.DB.prepare(`
      insert into submissions (exercise_id, user_id, mode, started_at)
      values (?, ?, 'untimed', '2026-09-05 10:00:00')
    `).bind(exercise.id, student.id).run()

    const rows = await env.DB.prepare(`
      select attempt_number
      from submissions
      where exercise_id = ? and user_id = ?
      order by attempt_number
    `).bind(exercise.id, student.id).all()
    expect(rows.results.map(row => row.attempt_number)).toEqual([1, 2])

    await expect(env.DB.prepare(`
      insert into submissions (exercise_id, user_id, mode, attempt_number)
      values (?, ?, 'untimed', 2)
    `).bind(exercise.id, student.id).run()).rejects.toThrow()
  })
})

describe('exercise attempt limit API', () => {
  it.each([undefined, true, false, 1.5, 0, -1, '2'])(
    'strictly rejects invalid create max_attempts %s',
    async (maxAttempts) => {
      const payload = {
        title: 'Invalid attempt limit',
        is_timed: false,
        duration_minutes: 0,
        schema: [{ q_id: 1, type: 'mcq', correct_answer: 'A' }],
      }
      if (maxAttempts !== undefined) payload.max_attempts = maxAttempts

      const response = await app.request('/api/exercises', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify(payload),
      }, env)

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      })
    },
  )

  it('supports finite, unlimited, omitted update, and explicit null update', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: 3 })
    expect(exercise.body.data.max_attempts).toBe(3)

    let response = await app.request(`/api/exercises/${exercise.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ title: 'Limit unchanged' }),
    }, env)
    expect((await response.json()).data.max_attempts).toBe(3)

    response = await app.request(`/api/exercises/${exercise.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ max_attempts: null }),
    }, env)
    expect((await response.json()).data.max_attempts).toBeNull()

    response = await app.request(`/api/exercises/${exercise.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ max_attempts: '4' }),
    }, env)
    expect(response.status).toBe(400)
  })

  it('tells teachers the highest attempt number already started', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: null })
    const first = (await (await startAttempt(exercise.id)).json()).data
    await startAttempt(exercise.id, {
      known_latest_attempt_number: 1,
      replace_submission_id: first.id,
    })

    const response = await app.request(`/api/exercises/${exercise.id}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)

    expect(response.status).toBe(200)
    expect((await response.json()).data.highest_attempt_number).toBe(2)
  })
})

describe('attempt allocation and student state', () => {
  it('allocates finite attempts, replays observed state, and reports exhaustion', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: 2 })

    const firstResponse = await startAttempt(exercise.id)
    expect(firstResponse.status).toBe(201)
    const first = (await firstResponse.json()).data
    expect(first.attempt_number).toBe(1)

    const resumeResponse = await startAttempt(exercise.id)
    expect(resumeResponse.status).toBe(200)
    expect((await resumeResponse.json()).data.id).toBe(first.id)

    const invalidReplacementResponse = await startAttempt(exercise.id, {
      replace_submission_id: first.id + 1000,
      known_latest_attempt_number: 1,
    })
    expect(invalidReplacementResponse.status).toBe(409)
    await expect(invalidReplacementResponse.json()).resolves.toMatchObject({
      error: { code: 'ATTEMPT_STATE_CHANGED' },
    })

    const overResponse = await startAttempt(exercise.id, {
      replace_submission_id: first.id,
      known_latest_attempt_number: 1,
    })
    expect(overResponse.status).toBe(201)
    const second = (await overResponse.json()).data
    expect(second.attempt_number).toBe(2)

    const replayResponse = await startAttempt(exercise.id, {
      replace_submission_id: first.id,
      known_latest_attempt_number: 1,
    })
    expect(replayResponse.status).toBe(200)
    expect((await replayResponse.json()).data.id).toBe(second.id)

    const submitResponse = await submitAttempt(second.id)
    expect((await submitResponse.json()).data.attempt_number).toBe(2)

    const submissionDetail = await app.request(`/api/submissions/${second.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    expect((await submissionDetail.json()).data.attempt_number).toBe(2)

    const submissionList = await app.request(`/api/submissions?exercise_id=${exercise.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    expect((await submissionList.json()).data.submissions[0].attempt_number).toBe(2)

    const exhaustedResponse = await startAttempt(exercise.id, {
      known_latest_attempt_number: 2,
      replace_submission_id: first.id,
    })
    expect(exhaustedResponse.status).toBe(409)
    await expect(exhaustedResponse.json()).resolves.toMatchObject({
      error: { code: 'ATTEMPT_LIMIT_REACHED' },
    })

    const exerciseDetail = await app.request(`/api/exercises/${exercise.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    await expect(exerciseDetail.json()).resolves.toMatchObject({
      data: { attempts_remaining: 0, can_start_attempt: 0 },
    })
  })

  it('allows unlimited attempts and returns the highest unsubmitted attempt', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: null })
    const first = (await (await startAttempt(exercise.id)).json()).data
    const second = (await (await startAttempt(exercise.id, {
      known_latest_attempt_number: 1,
      replace_submission_id: first.id,
    })).json()).data
    const third = (await (await startAttempt(exercise.id, {
      known_latest_attempt_number: 2,
      replace_submission_id: second.id,
    })).json()).data

    const detailResponse = await app.request(`/api/exercises/${exercise.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    await expect(detailResponse.json()).resolves.toMatchObject({
      data: {
        max_attempts: null,
        latest_attempt_number: 3,
        next_attempt_number: 4,
        in_progress_submission_id: third.id,
        in_progress_attempt_number: 3,
        attempts_remaining: null,
        can_start_attempt: 1,
      },
    })
  })

  it('falls back to the next-highest unsubmitted attempt after out-of-order completion', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: 3 })
    const first = (await (await startAttempt(exercise.id)).json()).data
    const second = (await (await startAttempt(exercise.id, {
      known_latest_attempt_number: 1,
      replace_submission_id: first.id,
    })).json()).data
    await submitAttempt(second.id)

    const listResponse = await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    const state = (await listResponse.json()).data.find(item => item.id === exercise.id)
    expect(state).toMatchObject({
      latest_attempt_number: 2,
      in_progress_submission_id: first.id,
      in_progress_attempt_number: 1,
      attempts_remaining: 1,
      can_start_attempt: 1,
    })
  })

  it('rejects stale unsafe state without allocating a later attempt', async () => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: 4 })
    const first = (await (await startAttempt(exercise.id)).json()).data
    const second = (await (await startAttempt(exercise.id, {
      known_latest_attempt_number: 1,
      replace_submission_id: first.id,
    })).json()).data
    const third = (await (await startAttempt(exercise.id, {
      known_latest_attempt_number: 2,
      replace_submission_id: second.id,
    })).json()).data
    await submitAttempt(third.id)
    await submitAttempt(second.id)
    await submitAttempt(first.id)

    const response = await startAttempt(exercise.id, { known_latest_attempt_number: 5 })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ATTEMPT_STATE_CHANGED' },
    })
    const count = await env.DB.prepare(
      'select count(*) as count from submissions where exercise_id = ?',
    ).bind(exercise.id).first()
    expect(count.count).toBe(3)
  })

  it.each([
    {},
    { known_latest_attempt_number: null },
    { known_latest_attempt_number: true },
    { known_latest_attempt_number: -1 },
    { known_latest_attempt_number: 1.2 },
    { known_latest_attempt_number: '0' },
    { known_latest_attempt_number: 0, replace_submission_id: 0 },
    { known_latest_attempt_number: 0, replace_submission_id: false },
  ])('strictly validates allocation payload %#', async (payload) => {
    const exercise = await createStudentReadyExercise(teacherToken, { max_attempts: 2 })
    const response = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exercise.id, ...payload }),
    }, env)
    expect(response.status).toBe(400)
  })
})
