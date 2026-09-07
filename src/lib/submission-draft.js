const PREFIX = 'smartclass-submission-v1:'
const VERSION = 1

function storage() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function submissionPointerKey(accountId, exerciseId) {
  return `${PREFIX}pointer:${accountId}:${exerciseId}`
}

export function submissionDraftKey(accountId, submissionId) {
  return `${PREFIX}draft:${accountId}:${submissionId}`
}

export function getSubmissionPointer(accountId, exerciseId) {
  return storage()?.getItem(submissionPointerKey(accountId, exerciseId)) || null
}

export function setSubmissionPointer(accountId, exerciseId, submissionId) {
  storage()?.setItem(submissionPointerKey(accountId, exerciseId), String(submissionId))
}

export function clearSubmissionState(accountId, exerciseId, submissionId) {
  const store = storage()
  if (!store) return
  store.removeItem(submissionPointerKey(accountId, exerciseId))
  if (submissionId != null) store.removeItem(submissionDraftKey(accountId, submissionId))
  // Remove the pre-versioned pointer when encountered during migration.
  store.removeItem(`submission_${exerciseId}`)
}

export function saveSubmissionDraft({ accountId, submissionId, answers, extractedConfidence }) {
  const store = storage()
  if (!store) return
  store.setItem(submissionDraftKey(accountId, submissionId), JSON.stringify({
    version: VERSION,
    accountId: String(accountId),
    submissionId: String(submissionId),
    answers,
    extractedConfidence,
  }))
}

export function loadSubmissionDraft({ accountId, submissionId, schema }) {
  const store = storage()
  if (!store) return null
  try {
    const parsed = JSON.parse(store.getItem(submissionDraftKey(accountId, submissionId)))
    if (
      parsed?.version !== VERSION ||
      parsed.accountId !== String(accountId) ||
      parsed.submissionId !== String(submissionId) ||
      !parsed.answers || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)
    ) return null

    const answers = {}
    const extractedConfidence = {}
    for (const row of schema || []) {
      const qId = row.q_id
      const key = `${qId}:${row.sub_id ?? ''}`
      const value = row.type === 'boolean'
        ? parsed.answers[qId]?.[row.sub_id]
        : parsed.answers[qId]
      if (typeof value === 'string') {
        if (row.type === 'boolean') {
          if (!answers[qId]) answers[qId] = {}
          answers[qId][row.sub_id] = value
        } else {
          answers[qId] = value
        }
      }
      const confidence = parsed.extractedConfidence?.[key]
      if (Number.isFinite(confidence)) extractedConfidence[key] = confidence
    }
    return { answers, extractedConfidence }
  } catch {
    return null
  }
}

export function clearAllSubmissionDrafts() {
  const store = storage()
  if (!store) return
  for (let index = store.length - 1; index >= 0; index--) {
    const key = store.key(index)
    if (key?.startsWith(PREFIX) || /^submission_\d+$/.test(key)) store.removeItem(key)
  }
}
