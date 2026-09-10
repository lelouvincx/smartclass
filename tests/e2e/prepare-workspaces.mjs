import assert from 'node:assert/strict'

// Synthetic local fixtures only. This helper has no remote-origin option.
const sites = {
  maths: 'http://localhost:8787',
  english: 'http://localhost:8788',
}
const phones = process.argv.slice(2)
assert(phones.length === 3 && new Set(phones).size === 3
  && phones.every(phone => /^\+8490000\d{4}$/.test(phone)),
  'Usage: node tests/e2e/prepare-workspaces.mjs <unused-access-phone> <unused-learner-phone> <unused-pending-phone>; use +8490000xxxx')

async function request(site, path, method = 'GET', body, token) {
  const response = await fetch(`${sites[site]}/api${path}`, {
    method,
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json()
  assert(response.ok && result.success, `${site} ${method} ${path}: ${result.error?.code ?? response.status}`)
  return result.data
}

async function login(site, phone) {
  return request(site, '/auth/login', 'POST', { phone, password: '123' })
}

for (const site of Object.keys(sites)) {
  const health = await request(site, '/health')
  assert.equal(health.environment, 'development', 'Use only the local QA emulators')
}

const teachers = {
  maths: await login('maths', '+84865481769'),
  english: await login('english', '+84865481770'),
}
for (const [site, teacher] of Object.entries(teachers)) {
  assert.equal(teacher.workspace.id, site)
  assert.equal(teacher.membership.role, 'teacher')
}

const fixtures = {}
for (const [index, role] of ['access', 'learner', 'pending'].entries()) {
  const phone = phones[index]
  const name = `E2E ${role} ${phone.slice(-4)}`
  // PHONE_EXISTS fails without overwriting an existing identity. A partial run
  // leaves already-created synthetic accounts; choose new phones on a new run.
  const registered = await request('maths', '/auth/register', 'POST', {
    name, phone, password: '123', grades: [12],
  })
  const id = registered.user.id
  if (role !== 'pending') {
    await request('maths', `/users/${id}/approve`, 'PUT', {}, teachers.maths.token)
    await request('maths', '/users/access-tier', 'PUT', {
      student_ids: [id], access_tier: 'vip',
    }, teachers.maths.token)
    const english = await login('english', phone)
    await request('english', '/auth/join', 'POST', { grades: [10] }, english.token)
    await request('english', `/users/${id}/approve`, 'PUT', {}, teachers.english.token)
  }
  const maths = await login('maths', phone)
  assert.equal(maths.membership.status, role === 'pending' ? 'pending' : 'active')
  assert.deepEqual(maths.membership.grades, [12])
  assert.equal(maths.membership.access_tier, role === 'pending' ? 'standard' : 'vip')
  fixtures[role] = { phone, id, name, maths: maths.membership }
  if (role !== 'pending') {
    const english = await login('english', phone)
    assert.equal(english.user.id, id)
    assert.equal(english.membership.status, 'active')
    assert.equal(english.membership.access_tier, 'standard')
    assert.deepEqual(english.membership.grades, [10])
    fixtures[role].english = english.membership
  }
}
console.log(JSON.stringify({ createdAt: new Date().toISOString(), fixtures }, null, 2))
