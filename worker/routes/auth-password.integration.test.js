import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index.js'
import { loginAsTeacher, seedStudent, seedTeacher } from '../test/helpers.js'

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
