import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index.js'
import { loginAsStudent, loginAsTeacher, seedStudent, seedTeacher } from '../test/helpers.js'

beforeEach(async () => {
  await seedTeacher()
})

describe('student names', () => {
  it('requires and trims a name when a student self-registers', async () => {
    const missingNameResponse = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000051', password: '123' }),
    }, env)

    expect(missingNameResponse.status).toBe(400)
    await expect(missingNameResponse.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Name, phone, and password are required.' },
    })

    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Nguyễn Văn An  ', phone: '+84900000051', password: '123' }),
    }, env)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      data: { name: 'Nguyễn Văn An', phone: '+84900000051', role: 'student', status: 'pending' },
    })
    await expect(env.DB.prepare(
      "SELECT name FROM users WHERE phone = '+84900000051'",
    ).first()).resolves.toEqual({ name: 'Nguyễn Văn An' })
  })

  it('lets a teacher create, list, and rename a named student', async () => {
    const token = await loginAsTeacher()
    const createResponse = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '  Trần Thị Bình  ', phone: '+84900000052' }),
    }, env)

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created.data).toMatchObject({ name: 'Trần Thị Bình', phone: '+84900000052' })

    const listResponse = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    const students = (await listResponse.json()).data
    expect(students).toContainEqual(expect.objectContaining({
      id: created.data.id,
      name: 'Trần Thị Bình',
    }))

    const renameResponse = await app.request(`/api/users/${created.data.id}/name`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '  Trần Bình  ' }),
    }, env)

    expect(renameResponse.status).toBe(200)
    await expect(renameResponse.json()).resolves.toMatchObject({
      data: { id: created.data.id, name: 'Trần Bình' },
    })
  })

  it('lets a student rename themselves and exposes the name through authentication', async () => {
    await seedStudent('+84900000053', 'Original Name')
    const token = await loginAsStudent('+84900000053')

    const renameResponse = await app.request('/api/auth/name', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '  Student Name  ' }),
    }, env)

    expect(renameResponse.status).toBe(200)
    await expect(renameResponse.json()).resolves.toMatchObject({
      data: { name: 'Student Name' },
    })

    const meResponse = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    await expect(meResponse.json()).resolves.toMatchObject({
      data: { name: 'Student Name', phone: '+84900000053' },
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000053', password: '123' }),
    }, env)
    await expect(loginResponse.json()).resolves.toMatchObject({
      data: { user: { name: 'Student Name' } },
    })
  })

  it('enforces teacher rename boundaries and rejects blank self-renames', async () => {
    await seedStudent('+84900000054')
    const studentToken = await loginAsStudent('+84900000054')
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000054'",
    ).first()

    const studentRenameResponse = await app.request(`/api/users/${student.id}/name`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Not Allowed' }),
    }, env)

    expect(studentRenameResponse.status).toBe(403)
    await expect(studentRenameResponse.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    })

    const teacherToken = await loginAsTeacher()
    const teacher = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84865481769'",
    ).first()
    const teacherRenameResponse = await app.request(`/api/users/${teacher.id}/name`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Other Teacher Name' }),
    }, env)

    expect(teacherRenameResponse.status).toBe(400)
    await expect(teacherRenameResponse.json()).resolves.toMatchObject({
      error: { code: 'INVALID_ROLE' },
    })

    const blankSelfRenameResponse = await app.request('/api/auth/name', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '   ' }),
    }, env)

    expect(blankSelfRenameResponse.status).toBe(400)
    await expect(blankSelfRenameResponse.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })
})

describe('student grade access', () => {
  it("lets a teacher bulk-replace multiple students' grade memberships", async () => {
    await seedStudent('+84900000061', 'Grade Student One')
    await seedStudent('+84900000062', 'Grade Student Two')
    const teacherToken = await loginAsTeacher()
    const rows = await env.DB.prepare(`
      SELECT id, phone
      FROM users
      WHERE phone IN ('+84900000061', '+84900000062')
      ORDER BY phone
    `).all()
    const studentIds = rows.results.map((student) => student.id)

    const response = await app.request('/api/users/grades', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: studentIds, grades: [10, 11] }),
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { student_ids: studentIds, grades: [10, 11] },
    })

    const listResponse = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    const students = (await listResponse.json()).data
      .filter((student) => studentIds.includes(student.id))
    expect(students).toHaveLength(2)
    expect(students.every((student) => (
      JSON.stringify(student.grades) === JSON.stringify([10, 11])
    ))).toBe(true)
  })

  it('rejects student grade changes and invalid bulk targets', async () => {
    await seedStudent('+84900000063', 'Grade Student')
    const studentToken = await loginAsStudent('+84900000063')
    const teacherToken = await loginAsTeacher()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000063'",
    ).first()
    const teacher = await env.DB.prepare(
      "SELECT id FROM users WHERE role = 'teacher' LIMIT 1",
    ).first()

    const studentResponse = await app.request('/api/users/grades', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: [student.id], grades: [12] }),
    }, env)
    expect(studentResponse.status).toBe(403)

    const invalidGradeResponse = await app.request('/api/users/grades', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: [student.id], grades: [] }),
    }, env)
    expect(invalidGradeResponse.status).toBe(400)

    const teacherTargetResponse = await app.request('/api/users/grades', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: [teacher.id], grades: [10] }),
    }, env)
    expect(teacherTargetResponse.status).toBe(400)
    await expect(teacherTargetResponse.json()).resolves.toMatchObject({
      error: { code: 'INVALID_STUDENTS' },
    })
  })
})
