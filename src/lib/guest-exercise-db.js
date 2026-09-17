import { gradeSubmission } from '../../shared/grading.js'

const DB_NAME = 'smartclass_guest_exercises_v1'
const DB_VERSION = 1
const memoryStore = {
  attempts: new Map(),
  answers: new Map(),
  results: new Map(),
  schemas: new Map(),
}

function nowIso() {
  return new Date().toISOString()
}

function answerKey(row) {
  return `${row.q_id}:${row.sub_id ?? ''}`
}

function storedAnswerKey(localAttemptId, key) {
  return `${localAttemptId}\u0000${key}`
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function isIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined'
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('attempts')) {
        const attempts = db.createObjectStore('attempts', { keyPath: 'localAttemptId' })
        attempts.createIndex('exercise', 'exerciseId')
        attempts.createIndex('submitted', 'submittedAt')
      }
      if (!db.objectStoreNames.contains('answers')) {
        db.createObjectStore('answers', { keyPath: ['localAttemptId', 'answerKey'] })
      }
      if (!db.objectStoreNames.contains('results')) db.createObjectStore('results', { keyPath: 'localAttemptId' })
      if (!db.objectStoreNames.contains('schemas')) db.createObjectStore('schemas', { keyPath: 'localAttemptId' })
    }
    request.onerror = () => reject(request.error || new Error('Could not open guest exercise storage'))
    request.onsuccess = () => resolve(request.result)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Guest exercise storage failed'))
    tx.onabort = () => reject(tx.error || new Error('Guest exercise storage was aborted'))
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error || new Error('Guest exercise storage failed'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function withDb(operation) {
  if (!isIndexedDbAvailable()) return operation(null)
  const db = await openDb()
  try {
    return await operation(db)
  } finally {
    db.close()
  }
}

function makeAttempt(exercise) {
  return {
    localAttemptId: randomId(),
    workspaceId: exercise.workspace_id ?? exercise.workspaceId ?? null,
    exerciseId: Number(exercise.id),
    exerciseTitle: exercise.title,
    questionAssetSetId: exercise.question_asset_set_id,
    startedAt: nowIso(),
    submittedAt: null,
    mode: exercise.duration_minutes > 0 ? 'timed' : 'untimed',
    durationMinutes: exercise.duration_minutes,
  }
}

export async function createGuestAttempt(exercise) {
  const attempt = makeAttempt(exercise)
  const schema = {
    localAttemptId: attempt.localAttemptId,
    exerciseId: attempt.exerciseId,
    questionAssetSetId: attempt.questionAssetSetId,
    rows: exercise.schema || [],
    questionAssets: exercise.question_assets || [],
  }
  await withDb(async (db) => {
    if (!db) {
      memoryStore.attempts.set(attempt.localAttemptId, clone(attempt))
      memoryStore.schemas.set(attempt.localAttemptId, clone(schema))
      return
    }
    const tx = db.transaction(['attempts', 'schemas'], 'readwrite')
    tx.objectStore('attempts').put(attempt)
    tx.objectStore('schemas').put(schema)
    await txDone(tx)
  })
  return attempt
}

export async function loadGuestAttempt(localAttemptId) {
  return withDb(async (db) => (db
    ? requestResult(db.transaction('attempts').objectStore('attempts').get(localAttemptId))
    : clone(memoryStore.attempts.get(localAttemptId))))
}

export async function loadGuestSchema(localAttemptId) {
  return withDb(async (db) => (db
    ? requestResult(db.transaction('schemas').objectStore('schemas').get(localAttemptId))
    : clone(memoryStore.schemas.get(localAttemptId))))
}

export async function loadGuestResult(localAttemptId) {
  return withDb(async (db) => (db
    ? requestResult(db.transaction('results').objectStore('results').get(localAttemptId))
    : clone(memoryStore.results.get(localAttemptId))))
}

export async function findGuestExerciseState(exerciseId, currentQuestionAssetSetId = null, workspaceId = undefined) {
  return withDb(async (db) => {
    const exerciseAttempts = db
      ? await requestResult(db.transaction('attempts').objectStore('attempts').index('exercise').getAll(Number(exerciseId)))
      : [...memoryStore.attempts.values()].filter(attempt => attempt.exerciseId === Number(exerciseId)).map(clone)
    const attempts = workspaceId === undefined
      ? exerciseAttempts
      : exerciseAttempts.filter(attempt => (attempt.workspaceId ?? null) === (workspaceId ?? null))
    const sorted = attempts.sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
    const matching = currentQuestionAssetSetId == null
      ? sorted
      : sorted.filter(attempt => attempt.questionAssetSetId === currentQuestionAssetSetId)
    const draft = matching.find(attempt => !attempt.submittedAt)
    if (draft) return { type: 'resume', localAttemptId: draft.localAttemptId, attempt: draft }
    const latestSubmitted = matching.find(attempt => attempt.submittedAt)
    return latestSubmitted ? { type: 'result', localAttemptId: latestSubmitted.localAttemptId, attempt: latestSubmitted } : null
  })
}

export async function hasGuestRegistrationEngagement(workspaceId = null) {
  return withDb(async (db) => {
    const attempts = db
      ? await requestResult(db.transaction('attempts').objectStore('attempts').getAll())
      : [...memoryStore.attempts.values()].map(clone)
    const workspaceAttempts = attempts.filter(attempt => (attempt.workspaceId ?? null) === (workspaceId ?? null))
    return workspaceAttempts.some(attempt => attempt.submittedAt) || workspaceAttempts.length >= 2
  })
}

export async function loadGuestAnswers(localAttemptId) {
  return withDb(async (db) => {
    const rows = db
      ? await requestResult(db.transaction('answers').objectStore('answers').getAll())
      : [...memoryStore.answers.values()].map(clone)
    const answers = {}
    for (const row of rows.filter(item => item.localAttemptId === localAttemptId)) {
      const [qId, subId] = row.answerKey.split(':')
      if (subId) {
        answers[qId] = { ...(answers[qId] || {}), [subId]: row.submitted_answer }
      } else {
        answers[qId] = row.submitted_answer
      }
    }
    return answers
  })
}

export async function saveGuestAnswer(localAttemptId, row, submittedAnswer) {
  await withDb(async (db) => {
    const key = answerKey(row)
    if (!db) {
      memoryStore.answers.set(storedAnswerKey(localAttemptId, key), {
        localAttemptId,
        answerKey: key,
        q_id: row.q_id,
        sub_id: row.sub_id ?? null,
        submitted_answer: submittedAnswer,
        updatedAt: nowIso(),
      })
      return
    }
    const tx = db.transaction('answers', 'readwrite')
    tx.objectStore('answers').put({
      localAttemptId,
      answerKey: key,
      q_id: row.q_id,
      sub_id: row.sub_id ?? null,
      submitted_answer: submittedAnswer,
      updatedAt: nowIso(),
    })
    await txDone(tx)
  })
}

export async function submitGuestAttempt(localAttemptId) {
  return withDb(async (db) => {
    const readTx = db?.transaction(['attempts', 'schemas', 'answers'])
    const attempt = db ? await requestResult(readTx.objectStore('attempts').get(localAttemptId)) : clone(memoryStore.attempts.get(localAttemptId))
    const schema = db ? await requestResult(readTx.objectStore('schemas').get(localAttemptId)) : clone(memoryStore.schemas.get(localAttemptId))
    const answerRows = db ? await requestResult(readTx.objectStore('answers').getAll()) : [...memoryStore.answers.values()].map(clone)
    if (!attempt || !schema) throw new Error('Guest attempt not found')
    if (attempt.submittedAt) return db ? requestResult(db.transaction('results').objectStore('results').get(localAttemptId)) : clone(memoryStore.results.get(localAttemptId))
    const submittedAnswers = schema.rows.map(row => {
      const stored = answerRows.find(answer => answer.localAttemptId === localAttemptId && answer.answerKey === answerKey(row))
      return { q_id: row.q_id, sub_id: row.sub_id ?? null, submitted_answer: stored?.submitted_answer ?? null }
    })
    const grading = gradeSubmission(schema.rows, submittedAnswers)
    const submittedAt = nowIso()
    const result = {
      localAttemptId,
      exerciseId: attempt.exerciseId,
      exerciseTitle: attempt.exerciseTitle,
      submittedAt,
      score: grading.score,
      answers: submittedAnswers.map(answer => ({
        ...answer,
        is_correct: grading.gradedAnswers.find(graded => graded.q_id === answer.q_id && (graded.sub_id ?? null) === (answer.sub_id ?? null))?.is_correct ?? 0,
      })),
    }
    if (!db) {
      memoryStore.attempts.set(localAttemptId, { ...attempt, submittedAt })
      memoryStore.results.set(localAttemptId, clone(result))
      return result
    }
    const tx = db.transaction(['attempts', 'results'], 'readwrite')
    tx.objectStore('attempts').put({ ...attempt, submittedAt })
    tx.objectStore('results').put(result)
    await txDone(tx)
    return result
  })
}

export async function discardGuestAttempt(localAttemptId) {
  await withDb(async (db) => {
    if (!db) {
      memoryStore.attempts.delete(localAttemptId)
      memoryStore.results.delete(localAttemptId)
      memoryStore.schemas.delete(localAttemptId)
      for (const key of [...memoryStore.answers.keys()]) {
        if (key.startsWith(`${localAttemptId}\u0000`)) memoryStore.answers.delete(key)
      }
      return
    }
    const tx = db.transaction(['attempts', 'answers', 'results', 'schemas'], 'readwrite')
    tx.objectStore('attempts').delete(localAttemptId)
    tx.objectStore('results').delete(localAttemptId)
    tx.objectStore('schemas').delete(localAttemptId)
    const answers = await requestResult(tx.objectStore('answers').getAll())
    for (const answer of answers.filter(row => row.localAttemptId === localAttemptId)) {
      tx.objectStore('answers').delete([answer.localAttemptId, answer.answerKey])
    }
    await txDone(tx)
  })
}

export async function clearAllGuestExerciseData() {
  memoryStore.attempts.clear()
  memoryStore.answers.clear()
  memoryStore.results.clear()
  memoryStore.schemas.clear()
  await withDb(async (db) => {
    if (!db) {
      return
    }
    const tx = db.transaction(['attempts', 'answers', 'results', 'schemas'], 'readwrite')
    for (const storeName of ['attempts', 'answers', 'results', 'schemas']) tx.objectStore(storeName).clear()
    await txDone(tx)
  })
}

export function countResultAnswers(result, schemaRows) {
  const total = schemaRows.length
  const correct = result.answers.filter(answer => answer.is_correct === 1).length
  const skipped = result.answers.filter(answer => answer.submitted_answer === null || answer.submitted_answer === '').length
  return { total, correct, skipped, incorrect: total - correct - skipped }
}
