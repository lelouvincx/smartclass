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

// Vision-LLM models the teacher can pick for image extraction (v0.4 PR C2).
// Public endpoint — no auth required. Returns { models: [...], default: id }.
export function getExtractModels() {
  return request('/api/extract-models')
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

// Returns a URL to serve a file from R2 via the file serve endpoint.
export function getFileUrl(fileId) {
  const base = import.meta.env.VITE_API_BASE_URL || ''
  return `${base}/api/files/${fileId}`
}

/**
 * Extract answers from an image of a filled answer sheet (v0.4).
 *
 * Uses XMLHttpRequest (not fetch) because we need real upload progress events.
 * The extract phase on the server is not progress-trackable — once upload is
 * 100%, the caller should switch to an indeterminate "extracting" state until
 * the promise resolves.
 *
 * @param {string} token         JWT bearer token
 * @param {number|string} submissionId
 * @param {File}   imageFile     jpeg/png, ≤ 20 MB
 * @param {string} [model]       OpenRouter model id; if omitted/unknown the
 *                               server falls back to DEFAULT_EXTRACT_MODEL.
 * @param {object} [opts]
 * @param {(fraction:number) => void} [opts.onProgress]  upload progress 0..1
 * @param {AbortSignal} [opts.signal]                    abort the upload
 * @returns {Promise<{file_id:number, model_used:string,
 *                    extracted: Array<{q_id:number, sub_id:string|null,
 *                                      answer:string|null, confidence:number}>,
 *                    warnings: string[]}>}
 */
export function extractAnswersFromImage(token, submissionId, imageFile, model, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('image', imageFile)
    if (model) form.append('model', model)

    xhr.open('POST', `${API_BASE_URL}/api/submissions/${submissionId}/extract`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
    }

    xhr.onload = () => {
      let body = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // body stays null — error path below
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.success) {
        resolve(body.data)
      } else {
        reject(new Error(body?.error?.message || `Extraction failed (HTTP ${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during extraction'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(form)
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
