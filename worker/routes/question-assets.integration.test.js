import { env } from 'cloudflare:test'
import { describe, expect, it, beforeAll } from 'vitest'
import app from '../index.js'
import {
  createExercise,
  loginAsStudent,
  loginAsTeacher,
  seedStudent,
  seedTeacher,
} from '../test/helpers.js'

let teacherToken
let studentToken

const DEFAULT_SCHEMA = [
  { q_id: 1, type: 'mcq', correct_answer: 'B' },
  { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1' },
  { q_id: 2, type: 'boolean', sub_id: 'b', correct_answer: '0' },
  { q_id: 2, type: 'boolean', sub_id: 'c', correct_answer: '0' },
  { q_id: 2, type: 'boolean', sub_id: 'd', correct_answer: '1' },
]

const IMAGE_FIXTURES = {
  'image/webp': 'UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoDAAIAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA',
  'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGPgEpGDIAY4CwANrAFp+FF+3AAAAABJRU5ErkJggg==',
  'image/jpeg': '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCbAFAH/9k=',
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

const GENERATED_WEBP_BYTES = decodeBase64(IMAGE_FIXTURES['image/webp'])
const SCREENSHOT_PNG_BYTES = decodeBase64(IMAGE_FIXTURES['image/png'])

beforeAll(async () => {
  await seedTeacher()
  await seedStudent()
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent()
})

async function createSourceFile(exerciseId) {
  const r2Key = `exercises/${exerciseId}/source.pdf`
  const result = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'exercise_pdf', ?, 'source.pdf', 1024)
  `).bind(exerciseId, r2Key).run()

  return result.meta.last_row_id
}

async function createAnswerFile(exerciseId, suffix = 'answer') {
  const r2Key = `exercises/${exerciseId}/${suffix}.pdf`
  const result = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'solution_pdf', ?, ?, 1024)
  `).bind(exerciseId, r2Key, `${suffix}.pdf`).run()

  return result.meta.last_row_id
}

async function createPendingSet(
  exerciseId,
  sourceFileId,
  requestToken = teacherToken,
  overrides = {},
) {
  return app.request(`/api/exercises/${exerciseId}/question-asset-sets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${requestToken}`,
    },
    body: JSON.stringify({
      source_file_id: sourceFileId,
      detector_version: 'text-geometry-v1',
      detection_method: 'text',
      ...overrides,
    }),
  }, env)
}

async function createPendingSetData(exerciseId, sourceFileId, overrides = {}) {
  const res = await createPendingSet(exerciseId, sourceFileId, teacherToken, overrides)
  return (await res.json()).data
}

function uploadAnswerCandidates(exerciseId, setId, candidates, requestToken = teacherToken) {
  return app.request(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/answer-candidates`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requestToken}`,
      },
      body: JSON.stringify({ candidates }),
    },
    env,
  )
}

function buildGeneratedAssetForm(overrides = {}) {
  const {
    imageBytes = GENERATED_WEBP_BYTES,
    imageType = 'image/webp',
    ...metadataOverrides
  } = overrides
  const values = {
    q_id: 1,
    segment_index: 0,
    source_page: 1,
    x: 0.1,
    y: 0.2,
    width: 0.8,
    height: 0.3,
    pixel_width: 3,
    pixel_height: 2,
    accessible_text: 'Question 1. Choose the correct answer.',
    confidence: 0.96,
    ...metadataOverrides,
  }
  const form = new FormData()
  const image = new File(
    [imageBytes],
    'question-1.webp',
    { type: imageType },
  )
  form.append('image', image)
  for (const [key, value] of Object.entries(values)) {
    form.append(key, String(value))
  }
  return form
}

function uploadGeneratedAsset(exerciseId, setId, overrides = {}, requestToken = teacherToken) {
  return app.request(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/assets`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${requestToken}` },
      body: buildGeneratedAssetForm(overrides),
    },
    env,
  )
}

function rejectQuestion(exerciseId, setId, qId, requestToken = teacherToken) {
  return app.request(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/questions/${qId}/reject`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${requestToken}` },
    },
    env,
  )
}

function buildScreenshotForm(overrides = {}) {
  const {
    accessible_text,
    pixel_width = 3,
    pixel_height = 2,
    mime = 'image/png',
    imageBytes = decodeBase64(IMAGE_FIXTURES[mime] || IMAGE_FIXTURES['image/png']),
  } = overrides
  const form = new FormData()
  form.append('image', new File(
    [imageBytes],
    'question-1.png',
    { type: mime },
  ))
  if (accessible_text !== undefined) form.append('accessible_text', accessible_text)
  form.append('pixel_width', String(pixel_width))
  form.append('pixel_height', String(pixel_height))
  return form
}

function replaceQuestionWithScreenshot(
  exerciseId,
  setId,
  qId,
  overrides = {},
  requestToken = teacherToken,
) {
  return app.request(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/questions/${qId}/screenshot`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${requestToken}` },
      body: buildScreenshotForm(overrides),
    },
    env,
  )
}

function buildGeneratedReplacementForm(qId, segments = [
  { segment_index: 0, source_page: 1, y: 0.1, height: 0.2 },
]) {
  const form = new FormData()
  const metadata = segments.map((segment, index) => {
    form.append(`image_${index}`, new File(
      [GENERATED_WEBP_BYTES],
      `question-${qId}-${index}.webp`,
      { type: 'image/webp' },
    ))
    return {
      segment_index: segment.segment_index,
      source_page: segment.source_page,
      x: 0.1,
      y: segment.y,
      width: 0.8,
      height: segment.height,
      pixel_width: 3,
      pixel_height: 2,
      accessible_text: `Retried question ${qId}, segment ${index + 1}.`,
      confidence: 0.96,
    }
  })
  form.append('segments', JSON.stringify(metadata))
  return form
}

function replaceQuestionWithGeneratedAssets(
  exerciseId,
  setId,
  qId,
  segments,
  requestToken = teacherToken,
) {
  return app.request(
    `/api/exercises/${exerciseId}/question-asset-sets/${setId}/questions/${qId}/assets`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${requestToken}` },
      body: buildGeneratedReplacementForm(qId, segments),
    },
    env,
  )
}

async function createReadySet(exerciseId, sourceFileId) {
  const assetSet = await createPendingSetData(exerciseId, sourceFileId)
  await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1 })
  await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2 })
  return assetSet
}

function activateSet(exerciseId, setId, schema = DEFAULT_SCHEMA, resolvedAnswerCandidateKeys) {
  return app.request(`/api/exercises/${exerciseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      schema,
      question_asset_set_id: setId,
      ...(resolvedAnswerCandidateKeys
        ? { resolved_answer_candidate_keys: resolvedAnswerCandidateKeys }
        : {}),
    }),
  }, env)
}

describe('POST /api/exercises/:exerciseId/question-asset-sets', () => {
  it('creates a pending set tied to the exercise source PDF', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)

    const res = await createPendingSet(exerciseId, sourceFileId)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toMatchObject({
      exercise_id: exerciseId,
      source_file_id: sourceFileId,
      detector_version: 'text-geometry-v1',
      detection_method: 'text',
      confirmed_by: null,
      confirmed_at: null,
    })

    const row = await env.DB.prepare(
      'SELECT * FROM exercise_question_asset_sets WHERE id = ?'
    ).bind(body.data.id).first()
    expect(row).toMatchObject({
      exercise_id: exerciseId,
      source_file_id: sourceFileId,
      confirmed_at: null,
    })

    const snapshot = await env.DB.prepare(`
      select q_id, sub_id, type, section_key, section_title, local_number
      from exercise_question_answer_schemas
      where asset_set_id = ?
      order by q_id, sub_id
    `).bind(body.data.id).all()
    expect(snapshot.results).toEqual(DEFAULT_SCHEMA.map((schemaRow) => ({
      q_id: schemaRow.q_id,
      sub_id: schemaRow.sub_id ?? null,
      type: schemaRow.type,
      section_key: 'main',
      section_title: null,
      local_number: schemaRow.q_id,
    })))
  })

  it('ties a pending set to the current teacher-only Answer PDF and parser result', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const answerFileId = await createAnswerFile(exerciseId)

    const res = await createPendingSet(exerciseId, sourceFileId, teacherToken, {
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })

    expect(res.status).toBe(201)
    expect((await res.json()).data).toMatchObject({
      source_file_id: sourceFileId,
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })
  })

  it("rejects another exercise's Answer PDF", async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const { id: otherExerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const answerFileId = await createAnswerFile(otherExerciseId)

    const res = await createPendingSet(exerciseId, sourceFileId, teacherToken, {
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_ANSWER_SOURCE_FILE')
  })

  it('rejects a student request', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)

    const res = await createPendingSet(exerciseId, sourceFileId, studentToken)

    expect(res.status).toBe(403)
  })

  it("rejects another exercise's source file", async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const { id: otherExerciseId } = await createExercise(teacherToken)
    const otherSourceFileId = await createSourceFile(otherExerciseId)

    const res = await createPendingSet(exerciseId, otherSourceFileId)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_SOURCE_FILE')
  })
})

describe('POST /api/exercises/:exerciseId/question-asset-sets/:setId/answer-candidates', () => {
  it('persists normalized candidates from both sources and returns them only to teachers', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const answerFileId = await createAnswerFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId, {
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })

    const candidates = [
      {
        q_id: 1,
        sub_id: null,
        type: 'mcq',
        proposed_answer: 'b',
        source_kind: 'answer_pdf_text',
        source_file_id: answerFileId,
        extractor_version: 'schema-parser-v1',
        confidence: 0.91,
      },
      {
        q_id: 1,
        sub_id: null,
        type: 'mcq',
        proposed_answer: 'B',
        source_kind: 'answer_pdf_green_highlight',
        source_file_id: answerFileId,
        source_page: 1,
        source_x: 0.1,
        source_y: 0.2,
        source_width: 0.3,
        source_height: 0.04,
        confidence: 1,
      },
    ]

    const res = await uploadAnswerCandidates(exerciseId, assetSet.id, candidates)

    expect(res.status).toBe(201)
    expect((await res.json()).data).toEqual([
      expect.objectContaining({
        q_id: 1,
        type: 'mcq',
        proposed_answer: 'B',
        source_kind: 'answer_pdf_green_highlight',
        source_file_id: answerFileId,
        source_page: 1,
      }),
      expect.objectContaining({
        q_id: 1,
        type: 'mcq',
        proposed_answer: 'B',
        source_kind: 'answer_pdf_text',
        source_file_id: answerFileId,
      }),
    ])

    const previewRes = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${assetSet.id}`,
      { headers: { 'Authorization': `Bearer ${teacherToken}` } },
      env,
    )
    expect((await previewRes.json()).data.answer_candidates).toHaveLength(2)

    const studentRes = await uploadAnswerCandidates(exerciseId, assetSet.id, candidates, studentToken)
    expect(studentRes.status).toBe(403)
  })

  it('rejects malformed source evidence and candidate files outside the set', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const { id: otherExerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const answerFileId = await createAnswerFile(exerciseId)
    const otherAnswerFileId = await createAnswerFile(otherExerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId, {
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })

    const wrongSource = await uploadAnswerCandidates(exerciseId, assetSet.id, [{
      q_id: 1,
      type: 'mcq',
      proposed_answer: 'A',
      source_kind: 'answer_pdf_text',
      source_file_id: otherAnswerFileId,
      confidence: 0.9,
    }])
    expect(wrongSource.status).toBe(400)

    const missingGreenGeometry = await uploadAnswerCandidates(exerciseId, assetSet.id, [{
      q_id: 1,
      type: 'mcq',
      proposed_answer: 'A',
      source_kind: 'answer_pdf_green_highlight',
      source_file_id: answerFileId,
      confidence: 1,
    }])
    expect(missingGreenGeometry.status).toBe(400)
  })
})

describe('POST /api/exercises/:exerciseId/question-asset-sets/:setId/assets', () => {
  it('uploads and persists a validated generated segment', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    const res = await uploadGeneratedAsset(exerciseId, assetSet.id)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toMatchObject({
      asset_set_id: assetSet.id,
      q_id: 1,
      segment_index: 0,
      source_kind: 'pdf_crop',
      source_page: 1,
      mime_type: 'image/webp',
      file_size: GENERATED_WEBP_BYTES.byteLength,
      pixel_width: 3,
      pixel_height: 2,
      accessible_text: 'Question 1. Choose the correct answer.',
      confidence: 0.96,
      rejected_at: null,
    })

    const stored = await env.DB.prepare(
      'select * from exercise_question_assets where id = ?'
    ).bind(body.data.id).first()
    const image = await env.BUCKET.get(stored.r2_key)
    expect(image).not.toBeNull()
    expect((await image.arrayBuffer()).byteLength).toBe(GENERATED_WEBP_BYTES.byteLength)
  })

  it('rejects invalid source bounds but accepts missing extracted text', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    const invalidBounds = await uploadGeneratedAsset(exerciseId, assetSet.id, {
      x: 0.8,
      width: 0.3,
    })
    expect(invalidBounds.status).toBe(400)

    const emptyText = await uploadGeneratedAsset(exerciseId, assetSet.id, {
      accessible_text: '   ',
    })
    expect(emptyText.status).toBe(201)
    expect((await emptyText.json()).data.accessible_text).toBeNull()

    const rows = await env.DB.prepare(
      'select id from exercise_question_assets where asset_set_id = ?'
    ).bind(assetSet.id).all()
    expect(rows.results).toHaveLength(1)
  })

  it('rejects malformed image bytes and dimensions that do not match the image', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    const malformed = await uploadGeneratedAsset(exerciseId, assetSet.id, {
      imageBytes: new Uint8Array(64).fill(0xab),
    })
    expect(malformed.status).toBe(400)
    expect((await malformed.json()).error.code).toBe('INVALID_IMAGE')

    const wrongDimensions = await uploadGeneratedAsset(exerciseId, assetSet.id, {
      pixel_width: 4,
    })
    expect(wrongDimensions.status).toBe(400)
    expect((await wrongDimensions.json()).error.code).toBe('INVALID_IMAGE_METADATA')
  })

  it('rejects a student upload', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    const res = await uploadGeneratedAsset(exerciseId, assetSet.id, {}, studentToken)

    expect(res.status).toBe(403)
  })

  it('rejects an asset outside the schema shape pinned when the set was created', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    const res = await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 99 })

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_ASSET_QUESTION')
  })
})

describe('GET /api/exercises/:exerciseId/question-asset-sets/:setId', () => {
  it('returns the pending preview in question and segment order', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2, segment_index: 1 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1, segment_index: 0 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2, segment_index: 0 })

    const res = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${assetSet.id}`,
      { headers: { 'Authorization': `Bearer ${teacherToken}` } },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.asset_set).toMatchObject({
      id: assetSet.id,
      exercise_id: exerciseId,
      confirmed_at: null,
    })
    expect(body.data.assets.map(({ q_id, segment_index }) => [q_id, segment_index])).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
    ])
    body.data.assets.forEach((asset) => {
      expect(asset.r2_key).toBeUndefined()
      expect(asset.file_url).toBe(`/api/question-assets/${asset.id}`)
    })
  })

  it('rejects a student preview request', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)

    const res = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${assetSet.id}`,
      { headers: { 'Authorization': `Bearer ${studentToken}` } },
      env,
    )

    expect(res.status).toBe(403)
  })
})

describe('teacher pending question asset set discovery', () => {
  it('returns only the latest pending set ID to a teacher', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const active = await createReadySet(exerciseId, sourceFileId)
    expect((await activateSet(exerciseId, active.id)).status).toBe(200)
    await createPendingSetData(exerciseId, sourceFileId)
    const latest = await createPendingSetData(exerciseId, sourceFileId)

    const teacherRes = await app.request(`/api/exercises/${exerciseId}`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    }, env)
    expect(teacherRes.status).toBe(200)
    expect((await teacherRes.json()).data.pending_question_asset_set_id).toBe(latest.id)

    const studentRes = await app.request(`/api/exercises/${exerciseId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)
    expect(studentRes.status).toBe(200)
    expect((await studentRes.json()).data.pending_question_asset_set_id).toBeUndefined()
  })
})

describe('POST /api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/reject', () => {
  it('rejects every segment for only the selected pending question', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1, segment_index: 0 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1, segment_index: 1 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2, segment_index: 0 })

    const res = await rejectQuestion(exerciseId, assetSet.id, 1)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ q_id: 1, rejected: true })

    const rows = await env.DB.prepare(`
      select q_id, rejected_by, rejected_at
      from exercise_question_assets
      where asset_set_id = ?
      order by q_id, segment_index
    `).bind(assetSet.id).all()
    expect(rows.results.filter((row) => row.q_id === 1)).toHaveLength(2)
    rows.results.filter((row) => row.q_id === 1).forEach((row) => {
      expect(row.rejected_by).toBeTypeOf('number')
      expect(row.rejected_at).toBeTypeOf('string')
    })
    expect(rows.results.find((row) => row.q_id === 2).rejected_at).toBeNull()
  })

  it('rejects an unknown question and a student request', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id)

    const unknown = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${assetSet.id}/questions/99/reject`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${teacherToken}` },
      },
      env,
    )
    expect(unknown.status).toBe(404)

    const student = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${assetSet.id}/questions/1/reject`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${studentToken}` },
      },
      env,
    )
    expect(student.status).toBe(403)
  })
})

describe('PUT /api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/assets', () => {
  it('atomically retries only the rejected question with ordered generated segments', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1, segment_index: 0 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2, segment_index: 0 })
    await rejectQuestion(exerciseId, assetSet.id, 1)

    const oldAsset = await env.DB.prepare(`
      select r2_key
      from exercise_question_assets
      where asset_set_id = ? and q_id = 1
    `).bind(assetSet.id).first()

    const res = await replaceQuestionWithGeneratedAssets(exerciseId, assetSet.id, 1, [
      { segment_index: 0, source_page: 1, y: 0.1, height: 0.2 },
      { segment_index: 1, source_page: 2, y: 0, height: 0.3 },
    ])

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.map(({ q_id, segment_index, source_kind }) => ({
      q_id,
      segment_index,
      source_kind,
    }))).toEqual([
      { q_id: 1, segment_index: 0, source_kind: 'pdf_crop' },
      { q_id: 1, segment_index: 1, source_kind: 'pdf_crop' },
    ])

    const rows = await env.DB.prepare(`
      select q_id, segment_index, rejected_at
      from exercise_question_assets
      where asset_set_id = ?
      order by q_id, segment_index
    `).bind(assetSet.id).all()
    expect(rows.results).toEqual([
      { q_id: 1, segment_index: 0, rejected_at: null },
      { q_id: 1, segment_index: 1, rejected_at: null },
      { q_id: 2, segment_index: 0, rejected_at: null },
    ])
    expect(await env.BUCKET.get(oldAsset.r2_key)).toBeNull()
  })

  it('rejects retry before rejection and rejects non-contiguous metadata', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1 })

    const unrejected = await replaceQuestionWithGeneratedAssets(exerciseId, assetSet.id, 1)
    expect(unrejected.status).toBe(409)

    await rejectQuestion(exerciseId, assetSet.id, 1)
    const invalid = await replaceQuestionWithGeneratedAssets(exerciseId, assetSet.id, 1, [
      { segment_index: 1, source_page: 1, y: 0.1, height: 0.2 },
    ])
    expect(invalid.status).toBe(400)

    const original = await env.DB.prepare(`
      select rejected_at
      from exercise_question_assets
      where asset_set_id = ? and q_id = 1
    `).bind(assetSet.id).first()
    expect(original.rejected_at).not.toBeNull()
  })
})

describe('PUT /api/exercises/:exerciseId/question-asset-sets/:setId/questions/:qId/screenshot', () => {
  it('atomically replaces only the rejected question with one screenshot', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1, segment_index: 0 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1, segment_index: 1 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2, segment_index: 0 })
    await rejectQuestion(exerciseId, assetSet.id, 1)

    const oldQuestionAssets = await env.DB.prepare(`
      select r2_key
      from exercise_question_assets
      where asset_set_id = ? and q_id = 1
    `).bind(assetSet.id).all()

    const res = await replaceQuestionWithScreenshot(exerciseId, assetSet.id, 1)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({
      asset_set_id: assetSet.id,
      q_id: 1,
      segment_index: 0,
      source_kind: 'teacher_screenshot',
      source_page: null,
      x: null,
      y: null,
      width: null,
      height: null,
      mime_type: 'image/png',
      file_size: SCREENSHOT_PNG_BYTES.byteLength,
      pixel_width: 3,
      pixel_height: 2,
      accessible_text: null,
      confidence: null,
      rejected_at: null,
    })

    const rows = await env.DB.prepare(`
      select q_id, segment_index, source_kind, r2_key
      from exercise_question_assets
      where asset_set_id = ?
      order by q_id, segment_index
    `).bind(assetSet.id).all()
    expect(rows.results.map(({ q_id, segment_index, source_kind }) => ({
      q_id,
      segment_index,
      source_kind,
    }))).toEqual([
      { q_id: 1, segment_index: 0, source_kind: 'teacher_screenshot' },
      { q_id: 2, segment_index: 0, source_kind: 'pdf_crop' },
    ])

    for (const { r2_key: r2Key } of oldQuestionAssets.results) {
      expect(await env.BUCKET.get(r2Key)).toBeNull()
    }
    const replacement = await env.BUCKET.get(rows.results[0].r2_key)
    expect(replacement).not.toBeNull()
    await replacement.arrayBuffer()

    const updatedSet = await env.DB.prepare(
      'select detection_method from exercise_question_asset_sets where id = ?'
    ).bind(assetSet.id).first()
    expect(updatedSet.detection_method).toBe('mixed')

    const exercise = await env.DB.prepare(
      'select active_question_asset_set_id from exercises where id = ?'
    ).bind(exerciseId).first()
    expect(exercise.active_question_asset_set_id).toBeNull()
  })

  it('rejects an unknown, unrejected, confirmed, or invalid replacement', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id)

    const unknown = await replaceQuestionWithScreenshot(exerciseId, assetSet.id, 99)
    expect(unknown.status).toBe(404)

    const unrejected = await replaceQuestionWithScreenshot(exerciseId, assetSet.id, 1)
    expect(unrejected.status).toBe(409)

    await rejectQuestion(exerciseId, assetSet.id, 1)

    const malformed = await replaceQuestionWithScreenshot(exerciseId, assetSet.id, 1, {
      imageBytes: new Uint8Array(64).fill(0xcd),
    })
    expect(malformed.status).toBe(400)
    expect((await malformed.json()).error.code).toBe('INVALID_IMAGE')

    await env.DB.prepare(`
      update exercise_question_asset_sets
      set confirmed_by = (select id from users where phone = '+84865481769')
        , confirmed_at = datetime('now')
      where id = ?
    `).bind(assetSet.id).run()
    const confirmed = await replaceQuestionWithScreenshot(exerciseId, assetSet.id, 1)
    expect(confirmed.status).toBe(409)
  })
})

describe('PUT /api/exercises/:id question asset activation', () => {
  it('keeps pinned section identity immutable while allowing answer corrections', async () => {
    const sectionedSchema = [
      {
        q_id: 1,
        section_key: 'section-1',
        section_title: 'Phần I',
        local_number: 1,
        type: 'mcq',
        correct_answer: 'B',
      },
      {
        q_id: 2,
        section_key: 'section-2',
        section_title: 'Phần II',
        local_number: 1,
        type: 'numeric',
        correct_answer: '42',
      },
    ]
    const { id: exerciseId } = await createExercise(teacherToken, { schema: sectionedSchema })
    const sourceFileId = await createSourceFile(exerciseId)
    const firstSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, firstSet.id, { q_id: 1 })
    await uploadGeneratedAsset(exerciseId, firstSet.id, { q_id: 2 })

    const changedIdentity = sectionedSchema.map((row) => (
      row.q_id === 2
        ? { ...row, section_key: 'section-1', section_title: 'Phần I', local_number: 2 }
        : row
    ))
    const rejected = await activateSet(exerciseId, firstSet.id, changedIdentity)
    expect(rejected.status).toBe(409)
    expect((await rejected.json()).error.message).toContain('schema shape')

    const correctedAnswers = sectionedSchema.map((row) => (
      row.q_id === 2 ? { ...row, correct_answer: '43' } : row
    ))
    const activated = await activateSet(exerciseId, firstSet.id, correctedAnswers)
    expect(activated.status).toBe(200)

    const snapshot = await env.DB.prepare(`
      select q_id, section_key, section_title, local_number, correct_answer
      from exercise_question_answer_schemas
      where asset_set_id = ?
      order by q_id
    `).bind(firstSet.id).all()
    expect(snapshot.results).toEqual(correctedAnswers.map((row) => ({
      q_id: row.q_id,
      section_key: row.section_key,
      section_title: row.section_title,
      local_number: row.local_number,
      correct_answer: row.correct_answer,
    })))
  })

  it('activates a complete set when best-effort extracted text is unavailable', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, assetSet.id, {
      q_id: 1,
      accessible_text: '   ',
    })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2 })

    const res = await activateSet(exerciseId, assetSet.id)

    expect(res.status).toBe(200)
    expect((await res.json()).data.active_question_asset_set_id).toBe(assetSet.id)
  })

  it('confirms a complete pending set and activates it with the proposed schema atomically', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)

    const res = await activateSet(exerciseId, assetSet.id)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.active_question_asset_set_id).toBe(assetSet.id)

    const confirmedSet = await env.DB.prepare(`
      select confirmed_by, confirmed_at
      from exercise_question_asset_sets
      where id = ?
    `).bind(assetSet.id).first()
    expect(confirmedSet.confirmed_by).toBeTypeOf('number')
    expect(confirmedSet.confirmed_at).toBeTypeOf('string')

    const schema = await env.DB.prepare(`
      select q_id, sub_id, type, correct_answer
      from answer_schemas
      where exercise_id = ?
      order by q_id, sub_id
    `).bind(exerciseId).all()
    expect(schema.results).toEqual(DEFAULT_SCHEMA.map((row) => ({
      ...row,
      sub_id: row.sub_id ?? null,
    })))
  })

  it('activates a large parsed schema without per-question D1 bindings', async () => {
    const schema = Array.from({ length: 101 }, (_, index) => ({
      q_id: index + 1,
      section_key: index < 50 ? 'section-1' : 'section-2',
      section_title: index < 50 ? 'Phần I' : 'Phần II',
      local_number: index < 50 ? index + 1 : index - 49,
      type: 'numeric',
      correct_answer: String(index + 1),
    }))
    const { id: exerciseId } = await createExercise(teacherToken, { schema })
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    for (const row of schema) {
      expect((await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: row.q_id })).status).toBe(201)
    }

    const res = await activateSet(exerciseId, assetSet.id, schema)

    expect(res.status).toBe(200)
    expect((await res.json()).data.active_question_asset_set_id).toBe(assetSet.id)
  })

  it('requires explicit teacher resolution when automatic answer candidates conflict', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const answerFileId = await createAnswerFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId, {
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2 })
    await uploadAnswerCandidates(exerciseId, assetSet.id, [
      {
        q_id: 1,
        type: 'mcq',
        proposed_answer: 'B',
        source_kind: 'answer_pdf_text',
        source_file_id: answerFileId,
        confidence: 0.9,
      },
      {
        q_id: 1,
        type: 'mcq',
        proposed_answer: 'C',
        source_kind: 'answer_pdf_green_highlight',
        source_file_id: answerFileId,
        source_page: 1,
        source_x: 0.1,
        source_y: 0.2,
        source_width: 0.3,
        source_height: 0.04,
        confidence: 1,
      },
    ])

    const unresolved = await activateSet(exerciseId, assetSet.id)
    expect(unresolved.status).toBe(409)
    expect((await unresolved.json()).error.message).toContain('answer conflict')

    const resolved = await activateSet(exerciseId, assetSet.id, DEFAULT_SCHEMA, [
      { q_id: 1, sub_id: null },
    ])
    expect(resolved.status).toBe(200)
  })

  it('blocks activation after the Answer PDF is replaced', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const answerFileId = await createAnswerFile(exerciseId, 'first-answer')
    const assetSet = await createPendingSetData(exerciseId, sourceFileId, {
      answer_source_file_id: answerFileId,
      answer_parser_status: 'parsed',
    })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 1 })
    await uploadGeneratedAsset(exerciseId, assetSet.id, { q_id: 2 })
    await createAnswerFile(exerciseId, 'replacement-answer')

    const res = await activateSet(exerciseId, assetSet.id)

    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toContain('outdated Answer PDF')
  })

  it('preserves the active set and schema when replacement activation is incomplete', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const firstSourceFileId = await createSourceFile(exerciseId)
    const firstSet = await createReadySet(exerciseId, firstSourceFileId)
    expect((await activateSet(exerciseId, firstSet.id)).status).toBe(200)

    const secondSourceFileId = await createSourceFile(exerciseId)
    const incompleteSet = await createPendingSetData(exerciseId, secondSourceFileId)
    await uploadGeneratedAsset(exerciseId, incompleteSet.id, { q_id: 1 })
    const proposedSchema = [
      { q_id: 1, type: 'numeric', correct_answer: '42' },
      { q_id: 2, type: 'mcq', correct_answer: 'A' },
    ]

    const res = await activateSet(exerciseId, incompleteSet.id, proposedSchema)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('ASSET_SET_NOT_READY')

    const exercise = await env.DB.prepare(`
      select active_question_asset_set_id
      from exercises
      where id = ?
    `).bind(exerciseId).first()
    expect(exercise.active_question_asset_set_id).toBe(firstSet.id)

    const replacement = await env.DB.prepare(`
      select confirmed_at
      from exercise_question_asset_sets
      where id = ?
    `).bind(incompleteSet.id).first()
    expect(replacement.confirmed_at).toBeNull()

    const schema = await env.DB.prepare(`
      select q_id, sub_id, type, correct_answer
      from answer_schemas
      where exercise_id = ?
      order by q_id, sub_id
    `).bind(exerciseId).all()
    expect(schema.results).toEqual(DEFAULT_SCHEMA.map((row) => ({
      ...row,
      sub_id: row.sub_id ?? null,
    })))
  })

  it('activates a complete set after a rejected crop is replaced by a screenshot', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    await rejectQuestion(exerciseId, assetSet.id, 1)
    expect((await replaceQuestionWithScreenshot(exerciseId, assetSet.id, 1)).status).toBe(200)

    const res = await activateSet(exerciseId, assetSet.id)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.active_question_asset_set_id).toBe(assetSet.id)
  })

  it.each([
    {
      name: 'a rejected question',
      arrange: async (exerciseId, setId) => rejectQuestion(exerciseId, setId, 1),
    },
    {
      name: 'a low-confidence crop',
      arrange: async (exerciseId, setId) => {
        const asset = await env.DB.prepare(`
          select r2_key
          from exercise_question_assets
          where asset_set_id = ? and q_id = 1
        `).bind(setId).first()
        await env.DB.prepare(`
          update exercise_question_assets
          set confidence = 0.74
          where asset_set_id = ? and q_id = 1
        `).bind(setId).run()
        return asset
      },
    },
    {
      name: 'an unexpected question',
      arrange: async (_exerciseId, setId) => env.DB.prepare(`
        insert into exercise_question_assets (
          asset_set_id, q_id, segment_index, source_kind, source_page,
          x, y, width, height, r2_key, mime_type, file_size,
          pixel_width, pixel_height, accessible_text, confidence
        )
        select asset_set_id, 99, segment_index, source_kind, source_page,
          x, y, width, height, r2_key || '-unexpected', mime_type, file_size,
          pixel_width, pixel_height, accessible_text, confidence
        from exercise_question_assets
        where asset_set_id = ? and q_id = 1
      `).bind(setId).run(),
    },
  ])('blocks activation with $name', async ({ arrange }) => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    await arrange(exerciseId, assetSet.id)

    const res = await activateSet(exerciseId, assetSet.id)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('ASSET_SET_NOT_READY')
    const persisted = await env.DB.prepare(`
      select active_question_asset_set_id
      from exercises
      where id = ?
    `).bind(exerciseId).first()
    expect(persisted.active_question_asset_set_id).toBeNull()
  })

  it('blocks activation with non-contiguous segments or a missing R2 object', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const gapSet = await createPendingSetData(exerciseId, sourceFileId)
    await uploadGeneratedAsset(exerciseId, gapSet.id, { q_id: 1, segment_index: 1 })
    await uploadGeneratedAsset(exerciseId, gapSet.id, { q_id: 2 })

    const gapResponse = await activateSet(exerciseId, gapSet.id)
    expect(gapResponse.status).toBe(409)

    const missingObjectSet = await createReadySet(exerciseId, sourceFileId)
    const missingObject = await env.DB.prepare(`
      select r2_key
      from exercise_question_assets
      where asset_set_id = ? and q_id = 1
    `).bind(missingObjectSet.id).first()
    await env.BUCKET.delete(missingObject.r2_key)

    const missingObjectResponse = await activateSet(exerciseId, missingObjectSet.id)
    expect(missingObjectResponse.status).toBe(409)
  })

  it('blocks an asset set from another exercise or an outdated source PDF', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    const { id: otherExerciseId } = await createExercise(teacherToken)

    const wrongExercise = await activateSet(otherExerciseId, assetSet.id)
    expect(wrongExercise.status).toBe(409)

    await createSourceFile(exerciseId)
    const staleSource = await activateSet(exerciseId, assetSet.id)
    expect(staleSource.status).toBe(409)
    const body = await staleSource.json()
    expect(body.error.message).toContain('outdated')
  })

  it('blocks schema-only edits while a question asset set is active', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    expect((await activateSet(exerciseId, assetSet.id)).status).toBe(200)

    const res = await app.request(`/api/exercises/${exerciseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        schema: [
          { q_id: 1, type: 'numeric', correct_answer: '42' },
          ...DEFAULT_SCHEMA.filter((row) => row.q_id === 2),
        ],
      }),
    }, env)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('ACTIVE_ASSET_SET_REQUIRES_REPLACEMENT')

    const currentSchema = await env.DB.prepare(`
      select q_id, sub_id, type, correct_answer
      from answer_schemas
      where exercise_id = ?
      order by q_id, sub_id
    `).bind(exerciseId).all()
    expect(currentSchema.results).toEqual(DEFAULT_SCHEMA.map((row) => ({
      ...row,
      sub_id: row.sub_id ?? null,
    })))
  })

  it('allows metadata edits with an unchanged schema while a question asset set is active', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    expect((await activateSet(exerciseId, assetSet.id)).status).toBe(200)

    const res = await app.request(`/api/exercises/${exerciseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        title: 'Updated title',
        schema: DEFAULT_SCHEMA,
      }),
    }, env)

    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({
      title: 'Updated title',
      active_question_asset_set_id: assetSet.id,
    })
  })
})

describe('student question asset resolution', () => {
  it('returns only the active confirmed assets from exercise detail', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const firstSourceFileId = await createSourceFile(exerciseId)
    const activeSet = await createReadySet(exerciseId, firstSourceFileId)
    await activateSet(exerciseId, activeSet.id)

    const nextSourceFileId = await createSourceFile(exerciseId)
    const pendingSet = await createPendingSetData(exerciseId, nextSourceFileId)
    await uploadGeneratedAsset(exerciseId, pendingSet.id, {
      q_id: 1,
      accessible_text: 'Pending question must stay private.',
    })

    const res = await app.request(`/api/exercises/${exerciseId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.question_asset_set_id).toBe(activeSet.id)
    expect(body.data.question_assets).toHaveLength(2)
    expect(body.data.question_assets.every((asset) => asset.asset_set_id === activeSet.id)).toBe(true)
    expect(body.data.question_assets.some(
      (asset) => asset.accessible_text === 'Pending question must stay private.'
    )).toBe(false)
    expect(body.data.schema.every((row) => row.correct_answer === undefined)).toBe(true)
  })

  it('pins the active set at submission start and keeps using it after replacement', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const firstSourceFileId = await createSourceFile(exerciseId)
    const firstSet = await createReadySet(exerciseId, firstSourceFileId)
    await activateSet(exerciseId, firstSet.id)

    const startRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    expect(startRes.status).toBe(201)
    const started = (await startRes.json()).data
    expect(started.question_asset_set_id).toBe(firstSet.id)

    const secondSourceFileId = await createSourceFile(exerciseId)
    const secondSet = await createPendingSetData(exerciseId, secondSourceFileId)
    await uploadGeneratedAsset(exerciseId, secondSet.id, {
      q_id: 1,
      accessible_text: 'Replacement generation question 1.',
    })
    await uploadGeneratedAsset(exerciseId, secondSet.id, {
      q_id: 2,
      accessible_text: 'Replacement generation question 2.',
    })
    await activateSet(exerciseId, secondSet.id, [
      { q_id: 1, type: 'numeric', correct_answer: '42' },
      ...DEFAULT_SCHEMA.filter((row) => row.q_id === 2),
    ])

    const detailRes = await app.request(`/api/submissions/${started.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()).data
    expect(detail.question_asset_set_id).toBe(firstSet.id)
    expect(detail.question_assets).toHaveLength(2)
    expect(detail.question_assets.every((asset) => asset.asset_set_id === firstSet.id)).toBe(true)
    expect(detail.question_assets.some(
      (asset) => asset.accessible_text.startsWith('Replacement generation')
    )).toBe(false)
    expect(detail.answers.find((answer) => answer.q_id === 1)).toMatchObject({
      type: 'mcq',
      submitted_answer: null,
    })
    expect(detail.answers.find((answer) => answer.q_id === 1).correct_answer).toBeUndefined()

    const submitRes = await app.request(`/api/submissions/${started.id}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        answers: [
          { q_id: 1, submitted_answer: 'B' },
          { q_id: 2, sub_id: 'a', submitted_answer: '1' },
          { q_id: 2, sub_id: 'b', submitted_answer: '0' },
          { q_id: 2, sub_id: 'c', submitted_answer: '0' },
          { q_id: 2, sub_id: 'd', submitted_answer: '1' },
        ],
      }),
    }, env)
    expect(submitRes.status).toBe(200)
    expect((await submitRes.json()).data.score).toBe(10)

    const reviewRes = await app.request(`/api/submissions/${started.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)
    const review = (await reviewRes.json()).data
    expect(review.answers.find((answer) => answer.q_id === 1)).toMatchObject({
      type: 'mcq',
      correct_answer: 'B',
      submitted_answer: 'B',
      is_correct: 1,
    })
  })

  it('rejects a new submission without an active confirmed set after the readiness cutover', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)

    const startRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)

    expect(startRes.status).toBe(409)
    expect((await startRes.json()).error.code).toBe('EXERCISE_NOT_READY')
  })
})

describe('GET /api/question-assets/:assetId', () => {
  it('keeps pending files teacher-only and uncached', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createPendingSetData(exerciseId, sourceFileId)
    const upload = await uploadGeneratedAsset(exerciseId, assetSet.id)
    const asset = (await upload.json()).data

    const studentRes = await app.request(`/api/question-assets/${asset.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)
    expect(studentRes.status).toBe(403)

    const teacherRes = await app.request(`/api/question-assets/${asset.id}`, {
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    }, env)
    expect(teacherRes.status).toBe(200)
    expect(teacherRes.headers.get('content-type')).toBe('image/webp')
    expect(teacherRes.headers.get('cache-control')).toBe('private, no-store')
    expect((await teacherRes.arrayBuffer()).byteLength).toBe(GENERATED_WEBP_BYTES.byteLength)
  })

  it('serves an active confirmed file to an authorized student with private caching', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    await activateSet(exerciseId, assetSet.id)
    const asset = await env.DB.prepare(`
      select id
      from exercise_question_assets
      where asset_set_id = ? and q_id = 1
    `).bind(assetSet.id).first()

    const unauthenticated = await app.request(`/api/question-assets/${asset.id}`, {}, env)
    expect(unauthenticated.status).toBe(401)

    const res = await app.request(`/api/question-assets/${asset.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect((await res.arrayBuffer()).byteLength).toBe(GENERATED_WEBP_BYTES.byteLength)
  })

  it('blocks active question assets when the student grade does not overlap', async () => {
    const { id: exerciseId } = await createExercise(teacherToken, { grades: [12] })
    const sourceFileId = await createSourceFile(exerciseId)
    const assetSet = await createReadySet(exerciseId, sourceFileId)
    await activateSet(exerciseId, assetSet.id)
    const asset = await env.DB.prepare(`
      SELECT id
      FROM exercise_question_assets
      WHERE asset_set_id = ? AND q_id = 1
    `).bind(assetSet.id).first()
    const student = await env.DB.prepare(
      "SELECT id FROM users WHERE phone = '+84123456789'",
    ).first()
    await env.DB.batch([
      env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
      env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)').bind(student.id),
    ])

    const res = await app.request(`/api/question-assets/${asset.id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'GRADE_ACCESS_DENIED' },
    })
  })
})

describe('question asset cleanup', () => {
  it('deletes an abandoned pending set without touching the active set', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const firstSourceFileId = await createSourceFile(exerciseId)
    const activeSet = await createReadySet(exerciseId, firstSourceFileId)
    await activateSet(exerciseId, activeSet.id)

    const secondSourceFileId = await createSourceFile(exerciseId)
    const pendingSet = await createPendingSetData(exerciseId, secondSourceFileId)
    await uploadGeneratedAsset(exerciseId, pendingSet.id)
    const pendingAsset = await env.DB.prepare(`
      select r2_key
      from exercise_question_assets
      where asset_set_id = ?
    `).bind(pendingSet.id).first()

    const res = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${pendingSet.id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${teacherToken}` },
      },
      env,
    )

    expect(res.status).toBe(200)
    expect(await env.DB.prepare(
      'select id from exercise_question_asset_sets where id = ?'
    ).bind(pendingSet.id).first()).toBeNull()
    expect(await env.BUCKET.get(pendingAsset.r2_key)).toBeNull()

    const exercise = await env.DB.prepare(`
      select active_question_asset_set_id
      from exercises
      where id = ?
    `).bind(exerciseId).first()
    expect(exercise.active_question_asset_set_id).toBe(activeSet.id)
    expect(await env.DB.prepare(
      'select id from exercise_question_asset_sets where id = ?'
    ).bind(activeSet.id).first()).not.toBeNull()
  })

  it('refuses to delete a confirmed set', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const activeSet = await createReadySet(exerciseId, sourceFileId)
    await activateSet(exerciseId, activeSet.id)

    const res = await app.request(
      `/api/exercises/${exerciseId}/question-asset-sets/${activeSet.id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${teacherToken}` },
      },
      env,
    )

    expect(res.status).toBe(409)
  })

  it('best-effort deletes derived objects when the exercise is deleted', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const sourceFileId = await createSourceFile(exerciseId)
    const activeSet = await createReadySet(exerciseId, sourceFileId)
    await activateSet(exerciseId, activeSet.id)
    const assets = await env.DB.prepare(`
      select r2_key
      from exercise_question_assets
      where asset_set_id = ?
    `).bind(activeSet.id).all()

    const res = await app.request(`/api/exercises/${exerciseId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${teacherToken}` },
    }, env)

    expect(res.status).toBe(200)
    expect(await env.DB.prepare(
      'select id from exercise_question_asset_sets where exercise_id = ?'
    ).bind(exerciseId).first()).toBeNull()
    for (const { r2_key: r2Key } of assets.results) {
      expect(await env.BUCKET.get(r2Key)).toBeNull()
    }
  })
})
