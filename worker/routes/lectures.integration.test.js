import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import app from '../index.js'
import { loginAsStudent, loginAsTeacher, seedStudent, seedTeacher } from '../test/helpers.js'

let teacherToken
let studentToken

beforeAll(async () => {
  await seedTeacher()
  await seedStudent('+84911111111')
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent('+84911111111')
})

function teacherRequest(path, method, body) {
  return app.request(`/api/lectures${path === '/' ? '' : path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${teacherToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }, env)
}

describe('lectures API', () => {
  it('lets a teacher create, edit, show or hide, reorder, and delete lectures', async () => {
    const firstResponse = await teacherRequest('/', 'POST', {
      title: 'Orb Lecture A',
      section_name: 'Chapter 1',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    })
    expect(firstResponse.status).toBe(201)
    const first = (await firstResponse.json()).data

    const secondResponse = await teacherRequest('/', 'POST', {
      title: 'Orb Lecture B',
      section_name: 'Chapter 2',
      youtube_url: 'https://youtu.be/lmnopqrstuv',
    })
    expect(secondResponse.status).toBe(201)
    const second = (await secondResponse.json()).data

    const updateResponse = await teacherRequest(`/${first.id}`, 'PUT', {
      title: 'Orb Lecture A revised',
      section_name: 'Chapter 1',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
    })
    expect(updateResponse.status).toBe(200)
    expect((await updateResponse.json()).data.title).toBe('Orb Lecture A revised')

    const hideResponse = await teacherRequest(`/${first.id}`, 'PUT', {
      title: 'Orb Lecture A revised',
      section_name: 'Chapter 1',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      is_visible: false,
    })
    expect(hideResponse.status).toBe(200)
    expect((await hideResponse.json()).data.is_visible).toBe(0)

    const orderResponse = await teacherRequest('/order', 'PUT', { ids: [second.id, first.id] })
    expect(orderResponse.status).toBe(200)

    const studentListResponse = await app.request('/api/lectures', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    expect(studentListResponse.status).toBe(200)
    const studentLectures = (await studentListResponse.json()).data
      .filter((lecture) => [first.id, second.id].includes(lecture.id))
    expect(studentLectures.map((lecture) => lecture.id)).toEqual([second.id])

    const teacherListResponse = await teacherRequest('/', 'GET')
    expect(teacherListResponse.status).toBe(200)
    const teacherLectures = (await teacherListResponse.json()).data
      .filter((lecture) => [first.id, second.id].includes(lecture.id))
    expect(teacherLectures.map((lecture) => lecture.id)).toEqual([second.id, first.id])
    expect(teacherLectures.map((lecture) => lecture.order_index)).toEqual([0, 1])
    expect(teacherLectures.map((lecture) => lecture.is_visible)).toEqual([1, 0])

    expect((await teacherRequest(`/${first.id}`, 'DELETE')).status).toBe(200)
    expect((await teacherRequest(`/${second.id}`, 'DELETE')).status).toBe(200)
  })

  it('rejects non-YouTube URLs and student mutations', async () => {
    const invalidResponse = await teacherRequest('/', 'POST', {
      title: 'Invalid URL',
      section_name: 'Chapter 1',
      youtube_url: 'https://example.com/video',
    })
    expect(invalidResponse.status).toBe(400)

    const nonVideoResponse = await teacherRequest('/', 'POST', {
      title: 'Channel page',
      section_name: 'Chapter 1',
      youtube_url: 'https://youtube.com/channel/abcdefghijk',
    })
    expect(nonVideoResponse.status).toBe(400)

    const studentResponse = await app.request('/api/lectures', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Forbidden',
        section_name: 'Chapter 1',
        youtube_url: 'https://youtu.be/abcdefghijk',
      }),
    }, env)
    expect(studentResponse.status).toBe(403)
  })

  it('requires authentication to list lectures', async () => {
    const response = await app.request('/api/lectures', {}, env)

    expect(response.status).toBe(401)
  })

  it('returns 404 when updating grades for a missing lecture', async () => {
    const response = await teacherRequest('/999999', 'PUT', {
      title: 'Missing lecture',
      section_name: 'Grade access',
      youtube_url: 'https://youtu.be/missing1234',
      grades: [10, 11],
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
  })

  it('stores multiple lecture grades and filters student access by overlap', async () => {
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84911111111'",
    ).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)').bind(student.id),
    ])
    const matchingResponse = await teacherRequest('/', 'POST', {
      title: 'Grade 10 and 11 lecture',
      section_name: 'Grade access',
      youtube_url: 'https://youtu.be/grade1011ab',
      grades: [10, 11],
    })
    const excludedResponse = await teacherRequest('/', 'POST', {
      title: 'Grade 12 lecture',
      section_name: 'Grade access',
      youtube_url: 'https://youtu.be/grade12only',
      grades: [12],
    })
    expect(matchingResponse.status).toBe(201)
    expect(excludedResponse.status).toBe(201)
    const matching = (await matchingResponse.json()).data
    const excluded = (await excludedResponse.json()).data
    expect(matching.grades).toEqual([10, 11])

    const studentListResponse = await app.request('/api/lectures', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    const studentIds = (await studentListResponse.json()).data.map((lecture) => lecture.id)
    expect(studentIds).toContain(matching.id)
    expect(studentIds).not.toContain(excluded.id)

    const updateResponse = await teacherRequest(`/${excluded.id}`, 'PUT', {
      title: excluded.title,
      section_name: excluded.section_name,
      youtube_url: excluded.youtube_url,
      grades: [10, 12],
    })
    expect(updateResponse.status).toBe(200)
    expect((await updateResponse.json()).data.grades).toEqual([10, 12])

    expect((await teacherRequest(`/${matching.id}`, 'DELETE')).status).toBe(200)
    expect((await teacherRequest(`/${excluded.id}`, 'DELETE')).status).toBe(200)
  })
})
