const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Request failed')
  }

  return data
}

function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  }
}

export function login(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function register(payload) {
  return request('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function getMe(token) {
  return request('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export function parseExerciseSchema(token, payload) {
  return request('/api/exercises/schema/parse', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function createExercise(token, payload) {
  return request('/api/exercises', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function createExerciseFileUpload(token, exerciseId, payload) {
  return request(`/api/upload/exercises/${exerciseId}/files/upload`, {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function uploadExerciseFile(token, exerciseId, metadata, file) {
  return request(`/api/upload/exercises/${exerciseId}/files`, {
    method: 'PUT',
    headers: authHeaders(token, {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size),
      'x-r2-key': encodeURIComponent(metadata.r2_key),
      'x-file-type': metadata.file_type,
      'x-file-name': encodeURIComponent(metadata.file_name),
    }),
    body: file,
  })
}

export function listExercises() {
  return request('/api/exercises')
}

export function updateExercise(token, id, payload) {
  return request(`/api/exercises/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function deleteExercise(token, id) {
  return request(`/api/exercises/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function getExercise(id, token) {
  return request(`/api/exercises/${id}`, {
    headers: token ? authHeaders(token) : {},
  })
}

export function createSubmission(token, payload) {
  return request('/api/submissions', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function submitAnswers(token, submissionId, answers) {
  return request(`/api/submissions/${submissionId}/submit`, {
    method: 'PUT',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ answers }),
  })
}

export function getSubmission(token, submissionId) {
  return request(`/api/submissions/${submissionId}`, {
    headers: authHeaders(token),
  })
}

export function listMySubmissions(token, { exerciseId, limit, offset } = {}) {
  const params = new URLSearchParams()
  if (exerciseId) params.set('exercise_id', exerciseId)
  if (limit !== undefined) params.set('limit', limit)
  if (offset !== undefined) params.set('offset', offset)

  const query = params.toString()
  const url = `/api/submissions${query ? `?${query}` : ''}`

  return request(url, {
    headers: authHeaders(token),
  })
}
