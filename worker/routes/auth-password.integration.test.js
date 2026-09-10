import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../test/helpers.js'
import { loginAsTeacher, seedStudent, seedTeacher } from '../test/helpers.js'
import { issueAccessToken, verifyAccessToken } from '../lib/auth.js'

describe('final app workspace authentication boundary', () => {
  it('accepts only the configured host and matching workspace token, never legacy credentials', async () => {
    await seedTeacher()
    const token = await loginAsTeacher()
    const teacher = await env.DB.prepare("select id, phone, role from users where phone = '+84865481769'").first()
    const claims = await verifyAccessToken(token, env)
    expect(claims).toMatchObject({ sub: String(teacher.id), workspace_id: 'maths' })
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub', 'workspace_id'])
    const ownSite = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }, env)
    expect(ownSite.status).toBe(200)
    expect((await ownSite.json()).data.membership).toMatchObject({ role: 'teacher', workspace_id: 'maths' })

    for (const path of ['/api/auth/me', '/api/users', '/api/exercises', '/api/lectures', '/api/submissions']) {
      const foreign = await app.request(`http://english-api.test${path}`, { headers: { Authorization: `Bearer ${token}` } }, env)
      expect(foreign.status).toBe(401)
      expect((await foreign.json()).error.code).toBe('UNAUTHORIZED')
    }
    const legacy = await issueAccessToken(env, teacher)
    const denied = await app.request('/api/users', { headers: { Authorization: `Bearer ${legacy}` } }, env)
    expect(denied.status).toBe(401)
    expect((await denied.json()).error.code).toBe('UNAUTHORIZED')
    const unsupported = await app.request('http://foreign-api.test/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: teacher.phone, password: '123' }),
    }, env)
    expect(unsupported.status).toBe(404)
    expect((await unsupported.json()).error.code).toBe('UNSUPPORTED_SITE')
  })

  it('uses live membership and platform roles, not the legacy user role', async () => {
    await seedTeacher()
    const token = await loginAsTeacher()
    const teacher = await env.DB.prepare("select id from users where phone = '+84865481769'").first()
    const manage = () => app.request('/api/users', { headers: { Authorization: `Bearer ${token}` } }, env)
    await env.DB.prepare("update users set role = 'student', status = 'disabled' where id = ?").bind(teacher.id).run()
    expect((await manage()).status).toBe(200)
    await env.DB.prepare("update workspace_memberships set status = 'disabled' where workspace_id = 'maths' and user_id = ?").bind(teacher.id).run()
    const disabled = await manage()
    expect(disabled.status).toBe(403)
    expect((await disabled.json()).error.code).toBe('MEMBERSHIP_DISABLED')
    await env.DB.prepare("update users set platform_role = 'platform_admin' where id = ?").bind(teacher.id).run()
    expect((await manage()).status).toBe(200)
    await env.DB.prepare('update users set disabled_at = current_timestamp where id = ?').bind(teacher.id).run()
    const globallyDisabled = await manage()
    expect(globallyDisabled.status).toBe(403)
    expect((await globallyDisabled.json()).error.code).toBe('ACCOUNT_DISABLED')
    const login = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84865481769', password: '123' }),
    }, env)
    expect(login.status).toBe(403)
    expect((await login.json()).error.code).toBe('ACCOUNT_DISABLED')
  })
})

describe('PUT /api/auth/password', () => {
  beforeEach(async () => {
    await seedTeacher()
  })

  it('requires authentication', async () => {
    const response = await app.request('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: '123', new_password: 'new-password' }),
    }, env)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    })
  })

  it('rejects an incorrect current password', async () => {
    const token = await loginAsTeacher()
    const response = await app.request('/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ current_password: 'wrong-password', new_password: 'new-password' }),
    }, env)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      },
    })
  })

  it('rejects a new password shorter than the existing password policy', async () => {
    const token = await loginAsTeacher()
    const response = await app.request('/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ current_password: '123', new_password: 'ab' }),
    }, env)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'WEAK_PASSWORD' },
    })
  })

  it('changes only the authenticated teacher password and permits login with it', async () => {
    const studentPhone = '+84900000002'
    await seedStudent(studentPhone)
    const student = await env.DB.prepare('SELECT id FROM users WHERE phone = ?')
      .bind(studentPhone)
      .first()
    const token = await loginAsTeacher()

    const response = await app.request('/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: '123',
        new_password: 'new-password',
        user_id: student.id,
      }),
    }, env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { password_changed: true },
    })

    const oldLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84865481769', password: '123' }),
    }, env)
    expect(oldLogin.status).toBe(401)

    const newLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+84865481769', password: 'new-password' }),
    }, env)
    expect(newLogin.status).toBe(200)

    const studentLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: studentPhone, password: '123' }),
    }, env)
    expect(studentLogin.status).toBe(200)
  })
})
