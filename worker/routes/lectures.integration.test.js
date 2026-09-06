import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import app from '../index.js'
import { issueAccessToken } from '../lib/auth.js'
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

  it('allows a Guest lecture list without authentication and rejects invalid credentials', async () => {
    const response = await app.request('/api/lectures', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')

    const invalidResponse = await app.request('/api/lectures', {
      headers: { Authorization: 'Bearer invalid-token' },
    }, env)
    expect(invalidResponse.status).toBe(401)

    const student = await env.DB.prepare(`
      SELECT id, phone, role FROM users WHERE phone = '+84911111111'
    `).first()
    const expiredToken = await issueAccessToken({
      JWT_SECRET: env.JWT_SECRET,
      JWT_EXPIRES_IN: '0s',
    }, student)
    const expiredResponse = await app.request('/api/lectures', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    }, env)
    expect(expiredResponse.status).toBe(401)
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

  it('stores multiple lecture access classes and filters student access by overlap', async () => {
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84911111111'",
    ).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare("INSERT INTO student_grades (user_id, grade) VALUES (?, 'dgnl')").bind(student.id),
    ])
    const matchingResponse = await teacherRequest('/', 'POST', {
      title: 'Grade 11 and ĐGNL lecture',
      section_name: 'Grade access',
      youtube_url: 'https://youtu.be/grade1011ab',
      grades: [11, 'dgnl'],
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
    expect(matching.grades).toEqual([11, 'dgnl'])

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
      grades: [12, 'dgnl'],
    })
    expect(updateResponse.status).toBe(200)
    expect((await updateResponse.json()).data.grades).toEqual([12, 'dgnl'])

    expect((await teacherRequest(`/${matching.id}`, 'DELETE')).status).toBe(200)
    expect((await teacherRequest(`/${excluded.id}`, 'DELETE')).status).toBe(200)
  })

  it('defaults lecture minimum access to Standard, preserves it on omission, and validates explicit values', async () => {
    const createResponse = await teacherRequest('/', 'POST', {
      title: 'Tier defaults',
      section_name: 'Tier access',
      youtube_url: 'https://youtu.be/tierdefault',
    })
    expect(createResponse.status).toBe(201)
    const lecture = (await createResponse.json()).data
    expect(lecture.minimum_access_tier).toBe('standard')

    const listResponse = await teacherRequest('/', 'GET')
    const listedLecture = (await listResponse.json()).data.find(({ id }) => id === lecture.id)
    expect(listedLecture.minimum_access_tier).toBe('standard')

    const invalidCreateResponse = await teacherRequest('/', 'POST', {
      title: 'Invalid tier',
      section_name: 'Tier access',
      youtube_url: 'https://youtu.be/invalidtier',
      minimum_access_tier: null,
    })
    expect(invalidCreateResponse.status).toBe(400)

    const updateResponse = await teacherRequest(`/${lecture.id}`, 'PUT', {
      title: 'Tier defaults revised',
      section_name: 'Tier access',
      youtube_url: lecture.youtube_url,
    })
    expect(updateResponse.status).toBe(200)
    expect((await updateResponse.json()).data.minimum_access_tier).toBe('standard')

    for (const tier of [null, 'gold']) {
      const invalidResponse = await teacherRequest(`/${lecture.id}`, 'PUT', {
        title: lecture.title,
        section_name: lecture.section_name,
        youtube_url: lecture.youtube_url,
        minimum_access_tier: tier,
      })
      expect(invalidResponse.status).toBe(400)
    }

    const vipResponse = await teacherRequest(`/${lecture.id}`, 'PUT', {
      title: lecture.title,
      section_name: lecture.section_name,
      youtube_url: lecture.youtube_url,
      minimum_access_tier: 'vip',
    })
    expect(vipResponse.status).toBe(200)
    expect((await vipResponse.json()).data.minimum_access_tier).toBe('vip')
  })

  it('enforces visibility, minimum tier, and programme overlap for Guest, Standard, and VIP audiences', async () => {
    const student = await env.DB.prepare("SELECT id FROM users WHERE phone = '+84911111111'").first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, ?)').bind(student.id, 10),
      env.DB.prepare("UPDATE users SET access_tier = 'standard', status = 'active' WHERE id = ?").bind(student.id),
    ])

    const definitions = [
      ['Guest other programme', 'guest', [12], true],
      ['Hidden Guest', 'guest', [10], false],
      ['Standard match', 'standard', [10], true],
      ['Standard other programme', 'standard', [12], true],
      ['VIP match', 'vip', [10], true],
      ['VIP other programme', 'vip', [12], true],
    ]
    const ids = {}
    for (const [title, tier, grades, isVisible] of definitions) {
      const created = await teacherRequest('/', 'POST', {
        title,
        section_name: 'Audience matrix',
        youtube_url: `https://youtu.be/${String(title.length).padStart(11, 'x')}`,
        minimum_access_tier: tier,
        grades,
        is_visible: isVisible,
      })
      expect(created.status).toBe(201)
      ids[title] = (await created.json()).data.id
    }

    const listIds = async (authorization) => {
      const headers = authorization ? { Authorization: authorization } : {}
      const response = await app.request('/api/lectures', { headers }, env)
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
      return (await response.json()).data.map(({ id }) => id)
    }

    const guestIds = await listIds()
    expect(guestIds).toContain(ids['Guest other programme'])
    expect(guestIds).not.toContain(ids['Hidden Guest'])
    expect(guestIds).not.toContain(ids['Standard match'])

    const standardIds = await listIds(`Bearer ${studentToken}`)
    expect(standardIds).toContain(ids['Guest other programme'])
    expect(standardIds).toContain(ids['Standard match'])
    expect(standardIds).not.toContain(ids['Standard other programme'])
    expect(standardIds).not.toContain(ids['VIP match'])

    await env.DB.prepare("UPDATE users SET access_tier = 'vip' WHERE id = ?").bind(student.id).run()
    const vipIds = await listIds(`Bearer ${studentToken}`)
    expect(vipIds).toContain(ids['Standard match'])
    expect(vipIds).toContain(ids['VIP match'])
    expect(vipIds).not.toContain(ids['Standard other programme'])
    expect(vipIds).not.toContain(ids['VIP other programme'])

    const teacherIds = await listIds(`Bearer ${teacherToken}`)
    expect(teacherIds).toContain(ids['Hidden Guest'])
    expect(teacherIds).toContain(ids['Standard other programme'])
  })

  it('uses live D1 student tier and status without issuing a new token', async () => {
    const student = await env.DB.prepare("SELECT id FROM users WHERE phone = '+84911111111'").first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, ?)').bind(student.id, 10),
      env.DB.prepare("UPDATE users SET access_tier = 'standard', status = 'active' WHERE id = ?").bind(student.id),
    ])
    const created = await teacherRequest('/', 'POST', {
      title: 'Live VIP access',
      section_name: 'Live authorization',
      youtube_url: 'https://youtu.be/liveviptest',
      minimum_access_tier: 'vip',
      grades: [10],
    })
    const lectureId = (await created.json()).data.id
    const request = () => app.request('/api/lectures', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)

    expect((await (await request()).json()).data.map(({ id }) => id)).not.toContain(lectureId)
    await env.DB.prepare("UPDATE users SET access_tier = 'vip' WHERE id = ?").bind(student.id).run()
    expect((await (await request()).json()).data.map(({ id }) => id)).toContain(lectureId)

    await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").bind(student.id).run()
    const disabledResponse = await request()
    expect(disabledResponse.status).toBe(403)
    await expect(disabledResponse.json()).resolves.toMatchObject({ error: { code: 'ACCOUNT_DISABLED' } })

    await env.DB.prepare("UPDATE users SET status = 'pending' WHERE id = ?").bind(student.id).run()
    expect((await request()).status).toBe(403)
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(student.id).run()
    expect((await request()).status).toBe(401)
  })
})
