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
  it('lets a teacher create, edit, reorder, and delete lectures', async () => {
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

    const orderResponse = await teacherRequest('/order', 'PUT', { ids: [second.id, first.id] })
    expect(orderResponse.status).toBe(200)

    const listResponse = await app.request('/api/lectures', {}, env)
    expect(listResponse.status).toBe(200)
    const lectures = (await listResponse.json()).data
      .filter((lecture) => [first.id, second.id].includes(lecture.id))
    expect(lectures.map((lecture) => lecture.id)).toEqual([second.id, first.id])
    expect(lectures.map((lecture) => lecture.order_index)).toEqual([0, 1])

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
})
