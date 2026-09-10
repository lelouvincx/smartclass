import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, setStudentGrades } from '../test/helpers.js'
import { loginAsStudent, loginAsTeacher, seedStudent, seedTeacher } from '../test/helpers.js'

beforeEach(async () => {
  await seedTeacher()
})

describe('student names', () => {
  it('requires a name and programme, then trims a name when a student self-registers', async () => {
    const missingNameResponse = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000051', password: '123' }),
    }, env)

    expect(missingNameResponse.status).toBe(400)
    await expect(missingNameResponse.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Name, phone, and password are required.' },
    })

    const missingGradesResponse = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nguyễn Văn An', phone: '+84900000051', password: '123', grades: [] }),
    }, env)

    expect(missingGradesResponse.status).toBe(400)
    await expect(missingGradesResponse.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })

    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Nguyễn Văn An  ', phone: '+84900000051', password: '123', grades: [10, 'dgnl'] }),
    }, env)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        user: { name: 'Nguyễn Văn An', phone: '+84900000051' },
        membership: { role: 'student', status: 'pending', grades: [10, 'dgnl'] },
        workspace: { id: 'maths' },
        teacher_routing: { action: 'stay' },
      },
    })
    await expect(env.DB.prepare(
      "SELECT name FROM users WHERE phone = '+84900000051'",
    ).first()).resolves.toEqual({ name: 'Nguyễn Văn An' })

    const teacherToken = await loginAsTeacher()
    const listResponse = await app.request('/api/users?status=pending', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(listResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ phone: '+84900000051', grades: [10, 'dgnl'] }),
      ]),
    })
  })

  it('lets a teacher create, list, and rename a named student', async () => {
    const token = await loginAsTeacher()
    const createResponse = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '  Trần Thị Bình  ', phone: '+84900000052', grades: [10] }),
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
    expect(await env.DB.prepare('select name from users where id = ?').bind(created.data.id).first('name')).toBe('Trần Thị Bình')
    expect(await env.DB.prepare("select display_name from workspace_memberships where user_id = ? and workspace_id = 'maths'").bind(created.data.id).first('display_name')).toBe('Trần Bình')
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
      data: { user: { name: 'Student Name' } },
    })

    const meResponse = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }, env)
    await expect(meResponse.json()).resolves.toMatchObject({
      data: { user: { name: 'Student Name', phone: '+84900000053' } },
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

    expect(teacherRenameResponse.status).toBe(404)
    await expect(teacherRenameResponse.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
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

describe('student removal', () => {
  it('lets a teacher deactivate and activate a student', async () => {
    await seedStudent('+84900000054', 'Status Student')
    const teacherToken = await loginAsTeacher()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000054'",
    ).first()

    const deactivateResponse = await app.request(`/api/users/${student.id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    }, env)

    expect(deactivateResponse.status).toBe(200)
    await expect(deactivateResponse.json()).resolves.toMatchObject({
      data: { id: student.id, status: 'disabled' },
    })
    await expect(env.DB.prepare("select status from workspace_memberships where user_id = ? and workspace_id = 'maths'").bind(student.id).first('status'))
      .resolves.toBe('disabled')

    const disabledLoginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000054', password: '123' }),
    }, env)
    expect(disabledLoginResponse.status).toBe(200)
    const disabledLogin = await disabledLoginResponse.json()
    expect(disabledLogin.data.membership.status).toBe('disabled')
    const deniedLearning = await app.request('/api/exercises', { headers: { Authorization: `Bearer ${disabledLogin.data.token}` } }, env)
    expect(deniedLearning.status).toBe(403)
    expect((await deniedLearning.json()).error.code).toBe('MEMBERSHIP_DISABLED')

    const activateResponse = await app.request(`/api/users/${student.id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    }, env)

    expect(activateResponse.status).toBe(200)
    await expect(activateResponse.json()).resolves.toMatchObject({
      data: { id: student.id, status: 'active' },
    })

    const activeLoginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000054', password: '123' }),
    }, env)
    expect(activeLoginResponse.status).toBe(200)
  })

  it('rejects activation of pending or disabled students without programme membership', async () => {
    const teacherToken = await loginAsTeacher()
    await seedStudent('+84900000067', 'Different Student With Programmes')
    for (const [phone, status] of [
      ['+84900000058', 'pending'],
      ['+84900000059', 'pending'],
      ['+84900000064', 'disabled'],
      ['+84900000066', 'active'],
    ]) {
      await seedStudent(phone, `No Programme ${phone}`)
      const student = await env.DB.prepare('select id from users where phone = ?').bind(phone).first()
      await setStudentGrades(student.id, [])
      await env.DB.prepare("update workspace_memberships set status = ? where user_id = ? and workspace_id = 'maths'").bind(status, student.id).run()
    }
    const rows = await env.DB.prepare(`
      select id, phone from users
      where phone in ('+84900000058', '+84900000059', '+84900000064', '+84900000066')
    `).all()
    const byPhone = Object.fromEntries(rows.results.map((row) => [row.phone, row]))

    const approveResponse = await app.request(`/api/users/${byPhone['+84900000058'].id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    expect(approveResponse.status).toBe(400)
    await expect(approveResponse.json()).resolves.toMatchObject({
      error: {
        code: 'PROGRAMMES_REQUIRED',
        message: 'Assign at least one programme before approving or activating this student.',
      },
    })

    const statusResponse = await app.request(`/api/users/${byPhone['+84900000059'].id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    }, env)
    expect(statusResponse.status).toBe(400)
    await expect(statusResponse.json()).resolves.toMatchObject({
      error: { code: 'PROGRAMMES_REQUIRED' },
    })

    const disabledResponse = await app.request(`/api/users/${byPhone['+84900000064'].id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    }, env)
    expect(disabledResponse.status).toBe(400)
    await expect(disabledResponse.json()).resolves.toMatchObject({
      error: { code: 'PROGRAMMES_REQUIRED' },
    })

    const alreadyActiveApproveResponse = await app.request(`/api/users/${byPhone['+84900000066'].id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    expect(alreadyActiveApproveResponse.status).toBe(400)
    await expect(alreadyActiveApproveResponse.json()).resolves.toMatchObject({
      error: { code: 'PROGRAMMES_REQUIRED' },
    })

    const alreadyActiveStatusResponse = await app.request(`/api/users/${byPhone['+84900000066'].id}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    }, env)
    expect(alreadyActiveStatusResponse.status).toBe(400)
    await expect(alreadyActiveStatusResponse.json()).resolves.toMatchObject({
      error: { code: 'PROGRAMMES_REQUIRED' },
    })

    const pendingListResponse = await app.request('/api/users?status=pending', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(pendingListResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: byPhone['+84900000058'].id, status: 'pending', grades: [] }),
        expect.objectContaining({ id: byPhone['+84900000059'].id, status: 'pending', grades: [] }),
      ]),
    })
    const disabledListResponse = await app.request('/api/users?status=disabled', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(disabledListResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: byPhone['+84900000064'].id, status: 'disabled', grades: [] }),
      ]),
    })
    const activeListResponse = await app.request('/api/users?status=active', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(activeListResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: byPhone['+84900000066'].id, status: 'active', grades: [] }),
      ]),
    })

    for (const [phone, code] of [
      ['+84900000058', 'MEMBERSHIP_PENDING'],
      ['+84900000059', 'MEMBERSHIP_PENDING'],
      ['+84900000064', 'MEMBERSHIP_DISABLED'],
    ]) {
      const loginResponse = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: '123' }),
      }, env)
      expect(loginResponse.status).toBe(200)
      const login = await loginResponse.json()
      const learning = await app.request('/api/exercises', { headers: { Authorization: `Bearer ${login.data.token}` } }, env)
      expect(learning.status).toBe(403)
      await expect(learning.json()).resolves.toMatchObject({
        error: { code },
      })
    }
  })

  it('keeps programme assignment separate from approval for no-programme pending students', async () => {
    const teacherToken = await loginAsTeacher()
    await seedStudent('+84900000065', 'No Programme Then DGNL')
    const student = await env.DB.prepare(
      "select id from users where phone = '+84900000065'",
    ).first()
    await setStudentGrades(student.id, [])
    await env.DB.prepare("update workspace_memberships set status = 'pending', access_tier = 'vip' where user_id = ? and workspace_id = 'maths'").bind(student.id).run()

    const gradesResponse = await app.request('/api/users/grades', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_ids: [student.id], grades: ['dgnl'] }),
    }, env)
    expect(gradesResponse.status).toBe(200)

    const pendingListResponse = await app.request('/api/users?status=pending', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(pendingListResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: student.id,
          name: 'No Programme Then DGNL',
          phone: '+84900000065',
          status: 'pending',
          access_tier: 'vip',
          grades: ['dgnl'],
        }),
      ]),
    })
    const pendingLoginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000065', password: '123' }),
    }, env)
    expect(pendingLoginResponse.status).toBe(200)
    const pendingLogin = await pendingLoginResponse.json()
    expect(pendingLogin.data.membership.status).toBe('pending')
    const pendingLearning = await app.request('/api/exercises', { headers: { Authorization: `Bearer ${pendingLogin.data.token}` } }, env)
    expect(pendingLearning.status).toBe(403)
    expect((await pendingLearning.json()).error.code).toBe('MEMBERSHIP_PENDING')

    const approveResponse = await app.request(`/api/users/${student.id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    expect(approveResponse.status).toBe(200)
    await expect(approveResponse.json()).resolves.toMatchObject({
      data: { id: student.id, status: 'active' },
    })

    const activeListResponse = await app.request('/api/users?status=active', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(activeListResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: student.id,
          name: 'No Programme Then DGNL',
          phone: '+84900000065',
          status: 'active',
          access_tier: 'vip',
          grades: ['dgnl'],
        }),
      ]),
    })
    const activeLoginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84900000065', password: '123' }),
    }, env)
    expect(activeLoginResponse.status).toBe(200)
  })

  it('lets a teacher remove a student without deleting their account record', async () => {
    await seedStudent('+84900000055', 'Removed Student')
    const teacherToken = await loginAsTeacher()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000055'",
    ).first()

    const response = await app.request(`/api/users/${student.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { id: student.id, removed: true },
    })
    await expect(env.DB.prepare("select status from workspace_memberships where user_id = ? and workspace_id = 'maths'").bind(student.id).first('status'))
      .resolves.toBe('disabled')
  })

  it('rejects student removal by students and teacher-account targets', async () => {
    await seedStudent('+84900000056', 'Student Target')
    const studentToken = await loginAsStudent('+84900000056')
    const teacherToken = await loginAsTeacher()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000056'",
    ).first()
    const teacher = await env.DB.prepare(
      "select user_id as id from workspace_memberships where workspace_id = 'maths' and role = 'teacher' limit 1",
    ).first()

    const studentResponse = await app.request(`/api/users/${student.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    expect(studentResponse.status).toBe(403)

    const teacherTargetResponse = await app.request(`/api/users/${teacher.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    expect(teacherTargetResponse.status).toBe(404)
    await expect(teacherTargetResponse.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
  })

  it('blocks an already-issued token after a teacher removes the student', async () => {
    await seedStudent('+84900000057', 'Token Student')
    const studentToken = await loginAsStudent('+84900000057')
    const teacherToken = await loginAsTeacher()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000057'",
    ).first()

    await app.request(`/api/users/${student.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)

    const me = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)
    expect(me.status).toBe(200)
    expect((await me.json()).data.membership.status).toBe('disabled')
    const response = await app.request('/api/exercises', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }, env)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MEMBERSHIP_DISABLED' },
    })
  })
})

describe('student class access', () => {
  it('lets a teacher assign and list the DGNL access class', async () => {
    await seedStudent('+84900000060', 'ĐGNL Student')
    const teacherToken = await loginAsTeacher()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84900000060'",
    ).first()

    const response = await app.request('/api/users/grades', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: [student.id], grades: ['dgnl'] }),
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { student_ids: [student.id], grades: ['dgnl'] },
    })

    const listResponse = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(listResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: student.id, grades: ['dgnl'] }),
      ]),
    })
  })

  it("lets a teacher bulk-replace multiple students' class memberships", async () => {
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
      "select user_id as id from workspace_memberships where workspace_id = 'maths' and role = 'teacher' limit 1",
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
    expect(teacherTargetResponse.status).toBe(404)
    await expect(teacherTargetResponse.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
  })
})

describe('student access tiers', () => {
  it('defaults teacher-created students to Standard and includes the tier when listing', async () => {
    const teacherToken = await loginAsTeacher()
    const createResponse = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Standard Student', phone: '+84900000081', grades: [12] }),
    }, env)

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(created.data.access_tier).toBe('standard')

    const listResponse = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    }, env)
    await expect(listResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: created.data.id, access_tier: 'standard' }),
      ]),
    })
  })

  it('accepts VIP student creation but rejects null, unknown, and Guest tiers', async () => {
    const teacherToken = await loginAsTeacher()
    const request = (phone, accessTier) => app.request('/api/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Tier Student', phone, access_tier: accessTier, grades: [10] }),
    }, env)

    const vipResponse = await request('+84900000082', 'vip')
    expect(vipResponse.status).toBe(201)
    await expect(vipResponse.json()).resolves.toMatchObject({ data: { access_tier: 'vip' } })

    for (const [phone, tier] of [
      ['+84900000083', null],
      ['+84900000084', 'gold'],
      ['+84900000085', 'guest'],
    ]) {
      const response = await request(phone, tier)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      })
    }
  })

  it('bulk-replaces tiers only after validating every target is a student', async () => {
    await seedStudent('+84900000086', 'Tier Student One')
    await seedStudent('+84900000087', 'Tier Student Two')
    const teacherToken = await loginAsTeacher()
    const rows = await env.DB.prepare(`
      SELECT id FROM users
      WHERE phone IN ('+84900000086', '+84900000087')
      ORDER BY id
    `).all()
    const studentIds = rows.results.map(({ id }) => id)
    const teacher = await env.DB.prepare("select user_id as id from workspace_memberships where workspace_id = 'maths' and role = 'teacher' limit 1").first()

    const invalidTargetResponse = await app.request('/api/users/access-tier', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: [studentIds[0], teacher.id], access_tier: 'vip' }),
    }, env)
    expect(invalidTargetResponse.status).toBe(404)
    expect(await env.DB.prepare("select access_tier from workspace_memberships where user_id = ? and workspace_id = 'maths'").bind(studentIds[0]).first('access_tier')).toBe('standard')

    const response = await app.request('/api/users/access-tier', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${teacherToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: studentIds, access_tier: 'vip' }),
    }, env)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: { student_ids: studentIds, access_tier: 'vip' },
    })
    const updated = await env.DB.prepare(`
      select distinct access_tier from workspace_memberships where user_id in (?, ?) and workspace_id = 'maths'
    `).bind(...studentIds).all()
    expect(updated.results).toEqual([{ access_tier: 'vip' }])
  })

  it('rejects invalid bulk tier payloads and keeps programme updates independent', async () => {
    await seedStudent('+84900000088', 'Independent Access Student')
    const teacherToken = await loginAsTeacher()
    const studentToken = await loginAsStudent('+84900000088')
    const student = await env.DB.prepare("SELECT id FROM users WHERE phone = '+84900000088'").first()

    const studentResponse = await app.request('/api/users/access-tier', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ student_ids: [student.id], access_tier: 'vip' }),
    }, env)
    expect(studentResponse.status).toBe(403)

    for (const payload of [
      { student_ids: [], access_tier: 'vip' },
      { student_ids: [student.id, student.id], access_tier: 'vip' },
      { student_ids: [0], access_tier: 'vip' },
      { student_ids: [student.id], access_tier: null },
      { student_ids: [student.id], access_tier: 'guest' },
    ]) {
      const response = await app.request('/api/users/access-tier', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${teacherToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }, env)
      expect(response.status).toBe(400)
    }

    await app.request('/api/users/access-tier', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_ids: [student.id], access_tier: 'vip' }),
    }, env)
    await app.request('/api/users/grades', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_ids: [student.id], grades: [10] }),
    }, env)

    expect(await env.DB.prepare("select access_tier from workspace_memberships where user_id = ? and workspace_id = 'maths'").bind(student.id).first('access_tier')).toBe('vip')
  })
})
