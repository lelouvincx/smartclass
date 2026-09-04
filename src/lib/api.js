const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (
  import.meta.env.PROD
    ? 'https://smartclass-api.dinhminhchinh3357.workers.dev'
    : 'http://localhost:8787'
)

async function request(path, options = {}) {
  const { responseType = 'json', ...fetchOptions } = options
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, fetchOptions)
  } catch (networkError) {
    throw new Error(
      'SmartClass can’t reach the server right now. Try again in a moment.',
      { cause: networkError },
    )
  }
  const data = response.ok && responseType === 'blob'
    ? await response.blob()
    : await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Request failed')
    error.status = response.status
    error.code = data?.error?.code
    throw error
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

export function changePassword(token, payload) {
  return request('/api/auth/password', {
    method: 'PUT',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
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

export function getExerciseFileBlob(fileId, token) {
  return request(`/api/files/${fileId}`, {
    headers: token ? authHeaders(token) : {},
    responseType: 'blob',
  })
}

export function createQuestionAssetSet(token, exerciseId, payload) {
  return request(`/api/exercises/${exerciseId}/question-asset-sets`, {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function getQuestionAssetSet(token, exerciseId, setId) {
  return request(`/api/exercises/${exerciseId}/question-asset-sets/${setId}`, {
    headers: authHeaders(token),
  })
}

export function uploadAnswerCandidates(token, exerciseId, setId, candidates) {
  return request(`/api/exercises/${exerciseId}/question-asset-sets/${setId}/answer-candidates`, {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ candidates }),
  })
}

export function deleteQuestionAssetSet(token, exerciseId, setId) {
  return request(`/api/exercises/${exerciseId}/question-asset-sets/${setId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function rejectQuestionAsset(token, exerciseId, setId, qId) {
  return request(`/api/exercises/${exerciseId}/question-asset-sets/${setId}/questions/${qId}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

export function getQuestionAssetBlob(token, fileUrl) {
  return request(fileUrl, {
    headers: authHeaders(token),
    responseType: 'blob',
  })
}

export function uploadGeneratedQuestionAsset(
  token,
  exerciseId,
  setId,
  asset,
  { onProgress, signal } = {},
) {
  const form = new FormData()
  form.append('image', new File([asset.blob], asset.fileName, { type: 'image/webp' }))
  form.append('q_id', String(asset.qId))
  form.append('segment_index', String(asset.segmentIndex))
  form.append('source_page', String(asset.sourcePage))
  form.append('x', String(asset.x))
  form.append('y', String(asset.y))
  form.append('width', String(asset.width))
  form.append('height', String(asset.height))
  form.append('pixel_width', String(asset.pixelWidth))
  form.append('pixel_height', String(asset.pixelHeight))
  if (asset.accessibleText?.trim()) {
    form.append('accessible_text', asset.accessibleText.trim())
  }
  form.append('confidence', String(asset.confidence))

  return uploadMultipart(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/assets`,
    token,
    'POST',
    form,
    { onProgress, signal },
  )
}

export function replaceQuestionAssetsWithGenerated(
  token,
  exerciseId,
  setId,
  qId,
  assets,
  { onProgress, signal } = {},
) {
  const form = new FormData()
  const segments = assets.map((asset, index) => {
    form.append(
      `image_${index}`,
      new File([asset.blob], asset.fileName, { type: 'image/webp' }),
    )
    return {
      segment_index: asset.segmentIndex,
      source_page: asset.sourcePage,
      x: asset.x,
      y: asset.y,
      width: asset.width,
      height: asset.height,
      pixel_width: asset.pixelWidth,
      pixel_height: asset.pixelHeight,
      accessible_text: asset.accessibleText?.trim() || null,
      confidence: asset.confidence,
    }
  })
  form.append('segments', JSON.stringify(segments))

  return uploadMultipart(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/questions/${qId}/assets`,
    token,
    'PUT',
    form,
    { onProgress, signal },
  )
}

export function replaceQuestionAssetWithScreenshot(
  token,
  exerciseId,
  setId,
  qId,
  image,
  { onProgress, signal } = {},
) {
  const form = new FormData()
  form.append('image', image)

  return getImageDimensions(image).then(({ width, height }) => {
    form.append('pixel_width', String(width))
    form.append('pixel_height', String(height))
    return uploadMultipart(
      `/api/exercises/${exerciseId}/question-asset-sets/${setId}/questions/${qId}/screenshot`,
      token,
      'PUT',
      form,
      { onProgress, signal },
    )
  })
}

export function listExercises() {
  return request('/api/exercises')
}

export function listLectures(token) {
  return request('/api/lectures', {
    headers: authHeaders(token),
  })
}

export function createLecture(token, payload) {
  return request('/api/lectures', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function updateLecture(token, id, payload) {
  return request(`/api/lectures/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function updateLectureOrder(token, ids) {
  return request('/api/lectures/order', {
    method: 'PUT',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ ids }),
  })
}

export function deleteLecture(token, id) {
  return request(`/api/lectures/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
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

export function getSubmissionExercisePdf(token, submissionId) {
  return request(`/api/submissions/${submissionId}/exercise-pdf`, {
    headers: authHeaders(token),
    responseType: 'blob',
  })
}

// Returns a URL to serve a file from R2 via the file serve endpoint.
export function getFileUrl(fileId) {
  return `${API_BASE_URL}/api/files/${fileId}`
}

function uploadMultipart(path, token, method, form, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${API_BASE_URL}${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      let body = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // The shared error below handles an invalid response body.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.success) {
        resolve(body)
      } else {
        const error = new Error(body?.error?.message || `Upload failed (HTTP ${xhr.status})`)
        error.status = xhr.status
        error.code = body?.error?.code
        reject(error)
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
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

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read the screenshot dimensions'))
    }
    image.src = url
  })
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
 * @param {string} [model]       DeepSeek model id; if omitted/unknown the
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

export function listStudents(token, { status } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)

  const query = params.toString()
  const url = `/api/users${query ? `?${query}` : ''}`

  return request(url, {
    headers: authHeaders(token),
  })
}

export function createStudent(token, payload) {
  return request('/api/users', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function approveStudent(token, userId) {
  return request(`/api/users/${userId}/approve`, {
    method: 'PUT',
    headers: authHeaders(token),
  })
}

export function loginWithGoogle(payload) {
  return request('/api/auth/google/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function linkGoogle(token, payload) {
  return request('/api/auth/google/link', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })
}

export function unlinkGoogle(token) {
  return request('/api/auth/google/link', {
    method: 'DELETE',
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
