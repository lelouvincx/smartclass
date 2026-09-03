import { Hono } from 'hono'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { toQuestionAssetResponse } from '../lib/question-assets.js'
import { inspectImageFile } from '../lib/image-metadata.js'
import { normalizeCorrectAnswer } from '../lib/schema-parser.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const questionAssetsRoutes = new Hono()
const DETECTION_METHODS = new Set(['text', 'manual'])
const ANSWER_PARSER_STATUSES = new Set(['not_provided', 'parsed', 'failed'])
const ANSWER_SOURCE_KINDS = new Set(['answer_pdf_text', 'exercise_green_highlight'])
const ANSWER_TYPES = new Set(['mcq', 'boolean', 'numeric'])
const MAX_ASSET_BYTES = 10 * 1024 * 1024
const MAX_ANSWER_CANDIDATES = 500

function parseInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function parseNumber(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

questionAssetsRoutes.post(
  '/:exerciseId/question-asset-sets',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const body = await c.req.json().catch(() => null)
    const {
      source_file_id,
      answer_source_file_id = null,
      answer_parser_status = 'not_provided',
      detector_version,
      detection_method,
    } = body || {}

    if (!Number.isInteger(exerciseId) || exerciseId < 1) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'exerciseId must be a positive integer')
    }

    if (!Number.isInteger(source_file_id) || source_file_id < 1) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'source_file_id must be a positive integer')
    }

    if (typeof detector_version !== 'string' || !detector_version.trim()) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'detector_version is required')
    }

    if (!DETECTION_METHODS.has(detection_method)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'detection_method is invalid')
    }

    if (
      !ANSWER_PARSER_STATUSES.has(answer_parser_status)
      || (answer_source_file_id === null && answer_parser_status !== 'not_provided')
      || (answer_source_file_id !== null && answer_parser_status === 'not_provided')
      || (answer_source_file_id !== null && (
        !Number.isInteger(answer_source_file_id) || answer_source_file_id < 1
      ))
    ) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Answer PDF and parser status are inconsistent')
    }

    const exercise = await c.env.DB.prepare(
      'select id from exercises where id = ?'
    ).bind(exerciseId).first()

    if (!exercise) {
      return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    }

    const sourceFile = await c.env.DB.prepare(`
      select id
      from exercise_files
      where id = ? and exercise_id = ? and file_type = 'exercise_pdf'
    `).bind(source_file_id, exerciseId).first()

    if (!sourceFile) {
      return jsonError(c, 400, 'INVALID_SOURCE_FILE', 'source_file_id must reference this exercise PDF')
    }

    if (answer_source_file_id !== null) {
      const answerSourceFile = await c.env.DB.prepare(`
        select id
        from exercise_files
        where id = ? and exercise_id = ? and file_type = 'solution_pdf'
      `).bind(answer_source_file_id, exerciseId).first()

      if (!answerSourceFile) {
        return jsonError(c, 400, 'INVALID_ANSWER_SOURCE_FILE', 'answer_source_file_id must reference this exercise Answer PDF')
      }
    }

    const result = await c.env.DB.prepare(`
      insert into exercise_question_asset_sets (
        exercise_id
        , source_file_id
        , answer_source_file_id
        , answer_parser_status
        , detector_version
        , detection_method
      )
      values (?, ?, ?, ?, ?, ?)
    `).bind(
      exerciseId,
      source_file_id,
      answer_source_file_id,
      answer_parser_status,
      detector_version.trim(),
      detection_method,
    ).run()

    const assetSet = await c.env.DB.prepare(
      'select * from exercise_question_asset_sets where id = ?'
    ).bind(result.meta.last_row_id).first()

    return jsonSuccess(c, assetSet, 201)
  },
)

questionAssetsRoutes.post(
  '/:exerciseId/question-asset-sets/:setId/answer-candidates',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)
    const body = await c.req.json().catch(() => null)

    if (!Number.isInteger(exerciseId) || exerciseId < 1 || !Number.isInteger(setId) || setId < 1) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise and asset set IDs must be positive integers')
    }

    if (
      !Array.isArray(body?.candidates)
      || body.candidates.length < 1
      || body.candidates.length > MAX_ANSWER_CANDIDATES
    ) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'candidates must be a non-empty bounded array')
    }

    const assetSet = await c.env.DB.prepare(`
      select id, source_file_id, answer_source_file_id, confirmed_at
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }
    if (assetSet.confirmed_at) {
      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
    }

    const normalized = []
    const seen = new Set()
    for (const candidate of body.candidates) {
      const result = normalizeAnswerCandidate(candidate, assetSet)
      if (result.error) {
        return jsonError(c, 400, 'INVALID_ANSWER_CANDIDATE', result.error)
      }
      const key = `${result.candidate.q_id}:${result.candidate.sub_id ?? ''}:${result.candidate.source_kind}`
      if (seen.has(key)) {
        return jsonError(c, 400, 'INVALID_ANSWER_CANDIDATE', 'Candidate source keys must be unique')
      }
      seen.add(key)
      normalized.push(result.candidate)
    }

    try {
      const results = await c.env.DB.batch(normalized.map(candidate => c.env.DB.prepare(`
        insert into exercise_question_answer_candidates (
          asset_set_id
          , q_id
          , sub_id
          , type
          , proposed_answer
          , source_kind
          , source_file_id
          , extractor_version
          , model_id
          , source_page
          , source_x
          , source_y
          , source_width
          , source_height
          , confidence
        )
        select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        from exercise_question_asset_sets
        where id = ? and exercise_id = ? and confirmed_at is null
        on conflict do update set
          type = excluded.type
          , proposed_answer = excluded.proposed_answer
          , source_file_id = excluded.source_file_id
          , extractor_version = excluded.extractor_version
          , model_id = excluded.model_id
          , source_page = excluded.source_page
          , source_x = excluded.source_x
          , source_y = excluded.source_y
          , source_width = excluded.source_width
          , source_height = excluded.source_height
          , confidence = excluded.confidence
          , created_at = current_timestamp
      `).bind(
        setId,
        candidate.q_id,
        candidate.sub_id,
        candidate.type,
        candidate.proposed_answer,
        candidate.source_kind,
        candidate.source_file_id,
        candidate.extractor_version,
        candidate.model_id,
        candidate.source_page,
        candidate.source_x,
        candidate.source_y,
        candidate.source_width,
        candidate.source_height,
        candidate.confidence,
        setId,
        exerciseId,
      )))

      if (results.some(result => result.meta.changes !== 1)) {
        return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
      }

      const persisted = await c.env.DB.prepare(`
        select * from exercise_question_answer_candidates
        where asset_set_id = ?
        order by q_id asc, sub_id asc, source_kind asc
      `).bind(setId).all()

      const persistedKeys = new Set(normalized.map(candidate => (
        `${candidate.q_id}:${candidate.sub_id ?? ''}:${candidate.source_kind}`
      )))
      return jsonSuccess(c, persisted.results.filter(candidate => persistedKeys.has(
        `${candidate.q_id}:${candidate.sub_id ?? ''}:${candidate.source_kind}`
      )), 201)
    } catch (error) {
      console.error('Answer candidate upload error:', error)
      return jsonError(c, 409, 'ANSWER_CANDIDATE_UPLOAD_FAILED', 'Failed to persist answer candidates')
    }
  },
)

questionAssetsRoutes.post(
  '/:exerciseId/question-asset-sets/:setId/assets',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)

    if (!Number.isInteger(exerciseId) || exerciseId < 1 || !Number.isInteger(setId) || setId < 1) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise and asset set IDs must be positive integers')
    }

    const assetSet = await c.env.DB.prepare(`
      select id, confirmed_at
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }

    if (assetSet.confirmed_at) {
      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
    }

    let body
    try {
      body = await c.req.parseBody()
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Request body must be multipart/form-data')
    }

    const image = body.image
    if (!(image instanceof File)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'image field is required')
    }

    if (image.type !== 'image/webp') {
      return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Generated question assets must be WebP images')
    }

    if (image.size < 1 || image.size > MAX_ASSET_BYTES) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Image size must be between 1 byte and 10 MB')
    }

    const metadata = {
      qId: parseInteger(body.q_id),
      segmentIndex: parseInteger(body.segment_index),
      sourcePage: parseInteger(body.source_page),
      x: parseNumber(body.x),
      y: parseNumber(body.y),
      width: parseNumber(body.width),
      height: parseNumber(body.height),
      pixelWidth: parseInteger(body.pixel_width),
      pixelHeight: parseInteger(body.pixel_height),
      accessibleText: typeof body.accessible_text === 'string'
        ? body.accessible_text.trim() || null
        : null,
      confidence: parseNumber(body.confidence),
    }

    const hasValidRectangle = metadata.x !== null
      && metadata.y !== null
      && metadata.width !== null
      && metadata.height !== null
      && metadata.x >= 0
      && metadata.y >= 0
      && metadata.width > 0
      && metadata.height > 0
      && metadata.x + metadata.width <= 1
      && metadata.y + metadata.height <= 1

    if (
      !metadata.qId || metadata.segmentIndex === null || !metadata.sourcePage
      || !metadata.pixelWidth || !metadata.pixelHeight
      || metadata.confidence === null || metadata.confidence < 0 || metadata.confidence > 1
      || !hasValidRectangle
    ) {
      return jsonError(c, 400, 'INVALID_ASSET_METADATA', 'Generated question asset metadata is invalid')
    }

    let inspectedImage
    try {
      inspectedImage = await inspectImageFile(image)
    } catch (error) {
      return jsonError(c, 400, 'INVALID_IMAGE', error.message)
    }

    if (
      metadata.pixelWidth !== inspectedImage.width
      || metadata.pixelHeight !== inspectedImage.height
    ) {
      return jsonError(c, 400, 'INVALID_IMAGE_METADATA', 'Image dimensions do not match pixel_width and pixel_height')
    }

    const r2Key = `exercise-question-assets/${exerciseId}/${setId}/${crypto.randomUUID()}.webp`
    let persisted = false

    try {
      await c.env.BUCKET.put(r2Key, inspectedImage.bytes, {
        httpMetadata: { contentType: inspectedImage.mimeType },
      })

      const result = await c.env.DB.prepare(`
        insert into exercise_question_assets (
          asset_set_id
          , q_id
          , segment_index
          , source_kind
          , source_page
          , x
          , y
          , width
          , height
          , r2_key
          , mime_type
          , file_size
          , pixel_width
          , pixel_height
          , accessible_text
          , confidence
        )
        select ?, ?, ?, 'pdf_crop', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        from exercise_question_asset_sets
        where id = ? and exercise_id = ? and confirmed_at is null
      `).bind(
        setId,
        metadata.qId,
        metadata.segmentIndex,
        metadata.sourcePage,
        metadata.x,
        metadata.y,
        metadata.width,
        metadata.height,
        r2Key,
        inspectedImage.mimeType,
        inspectedImage.bytes.byteLength,
        inspectedImage.width,
        inspectedImage.height,
        metadata.accessibleText,
        metadata.confidence,
        setId,
        exerciseId,
      ).run()

      if (result.meta.changes === 0) {
        await c.env.BUCKET.delete(r2Key)
        return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
      }
      persisted = true

      const asset = await c.env.DB.prepare(
        'select * from exercise_question_assets where id = ?'
      ).bind(result.meta.last_row_id).first()

      return jsonSuccess(c, toQuestionAssetResponse(asset), 201)
    } catch (error) {
      if (!persisted) {
        await c.env.BUCKET.delete(r2Key).catch(() => {})
      }
      console.error('Question asset upload error:', error)
      return jsonError(c, 409, 'ASSET_UPLOAD_FAILED', 'Failed to persist question asset')
    }
  },
)

questionAssetsRoutes.get(
  '/:exerciseId/question-asset-sets/:setId',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)

    if (!Number.isInteger(exerciseId) || exerciseId < 1 || !Number.isInteger(setId) || setId < 1) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise and asset set IDs must be positive integers')
    }

    const assetSet = await c.env.DB.prepare(`
      select *
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }

    const assets = await c.env.DB.prepare(`
      select *
      from exercise_question_assets
      where asset_set_id = ?
      order by q_id asc, segment_index asc
    `).bind(setId).all()

    const answerCandidates = await c.env.DB.prepare(`
      select *
      from exercise_question_answer_candidates
      where asset_set_id = ?
      order by q_id asc, sub_id asc, source_kind asc
    `).bind(setId).all()

    return jsonSuccess(c, {
      asset_set: assetSet,
      assets: assets.results.map(toQuestionAssetResponse),
      answer_candidates: answerCandidates.results,
    })
  },
)

questionAssetsRoutes.delete(
  '/:exerciseId/question-asset-sets/:setId',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)

    if (!Number.isInteger(exerciseId) || exerciseId < 1 || !Number.isInteger(setId) || setId < 1) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise and asset set IDs must be positive integers')
    }

    const assetSet = await c.env.DB.prepare(`
      select id, confirmed_at
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }

    if (assetSet.confirmed_at) {
      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets cannot be deleted')
    }

    const assets = await c.env.DB.prepare(`
      select r2_key
      from exercise_question_assets
      where asset_set_id = ?
    `).bind(setId).all()

    const result = await c.env.DB.prepare(`
      delete from exercise_question_asset_sets
      where id = ?
        and exercise_id = ?
        and confirmed_at is null
        and not exists (
          select 1
          from exercises exercise
          where exercise.active_question_asset_set_id = exercise_question_asset_sets.id
        )
        and not exists (
          select 1
          from submissions submission
          where submission.question_asset_set_id = exercise_question_asset_sets.id
        )
    `).bind(setId, exerciseId).run()

    if (result.meta.changes === 0) {
      return jsonError(c, 409, 'ASSET_SET_IN_USE', 'Question asset set is still in use')
    }

    await Promise.allSettled(
      assets.results.map((asset) => c.env.BUCKET.delete(asset.r2_key)),
    )

    return jsonSuccess(c, { id: setId, deleted: true })
  },
)

questionAssetsRoutes.post(
  '/:exerciseId/question-asset-sets/:setId/questions/:qId/reject',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)
    const qId = Number.parseInt(c.req.param('qId'), 10)

    if (
      !Number.isInteger(exerciseId) || exerciseId < 1
      || !Number.isInteger(setId) || setId < 1
      || !Number.isInteger(qId) || qId < 1
    ) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise, asset set, and question IDs must be positive integers')
    }

    const assetSet = await c.env.DB.prepare(`
      select id, confirmed_at
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }

    if (assetSet.confirmed_at) {
      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
    }

    const authUser = c.get('authUser')
    const result = await c.env.DB.prepare(`
      update exercise_question_assets
      set rejected_by = ?, rejected_at = datetime('now')
      where asset_set_id = ?
        and q_id = ?
        and exists (
          select 1
          from exercise_question_asset_sets
          where id = ? and exercise_id = ? and confirmed_at is null
        )
    `).bind(authUser.id, setId, qId, setId, exerciseId).run()

    if (result.meta.changes === 0) {
      const question = await c.env.DB.prepare(`
        select id
        from exercise_question_assets
        where asset_set_id = ? and q_id = ?
      `).bind(setId, qId).first()

      if (!question) {
        return jsonError(c, 404, 'NOT_FOUND', 'Question not found in this asset set')
      }

      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
    }

    return jsonSuccess(c, { q_id: qId, rejected: true })
  },
)

questionAssetsRoutes.put(
  '/:exerciseId/question-asset-sets/:setId/questions/:qId/assets',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)
    const qId = Number.parseInt(c.req.param('qId'), 10)

    if (
      !Number.isInteger(exerciseId) || exerciseId < 1
      || !Number.isInteger(setId) || setId < 1
      || !Number.isInteger(qId) || qId < 1
    ) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise, asset set, and question IDs must be positive integers')
    }

    const assetSet = await c.env.DB.prepare(`
      select id, confirmed_at
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }

    if (assetSet.confirmed_at) {
      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
    }

    const oldAssets = await c.env.DB.prepare(`
      select id, r2_key, rejected_at
      from exercise_question_assets
      where asset_set_id = ? and q_id = ?
      order by segment_index asc
    `).bind(setId, qId).all()

    if (oldAssets.results.length === 0) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question not found in this asset set')
    }

    if (oldAssets.results.some((asset) => !asset.rejected_at)) {
      return jsonError(c, 409, 'QUESTION_NOT_REJECTED', 'Reject the generated question before retrying it')
    }

    let body
    try {
      body = await c.req.parseBody()
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Request body must be multipart/form-data')
    }

    let segments
    try {
      segments = JSON.parse(body.segments)
    } catch {
      return jsonError(c, 400, 'INVALID_ASSET_METADATA', 'segments must be valid JSON')
    }

    if (!Array.isArray(segments) || segments.length === 0) {
      return jsonError(c, 400, 'INVALID_ASSET_METADATA', 'At least one generated segment is required')
    }

    const replacements = []
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const image = body[`image_${index}`]
      const hasValidRectangle = segment
        && Number.isFinite(segment.x)
        && Number.isFinite(segment.y)
        && Number.isFinite(segment.width)
        && Number.isFinite(segment.height)
        && segment.x >= 0
        && segment.y >= 0
        && segment.width > 0
        && segment.height > 0
        && segment.x + segment.width <= 1
        && segment.y + segment.height <= 1

      if (
        !segment
        || segment.segment_index !== index
        || !Number.isInteger(segment.source_page) || segment.source_page < 1
        || !Number.isInteger(segment.pixel_width) || segment.pixel_width < 1
        || !Number.isInteger(segment.pixel_height) || segment.pixel_height < 1
        || !Number.isFinite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1
        || !hasValidRectangle
      ) {
        return jsonError(c, 400, 'INVALID_ASSET_METADATA', 'Generated question asset metadata is invalid')
      }

      if (!(image instanceof File)) {
        return jsonError(c, 400, 'VALIDATION_ERROR', `image_${index} field is required`)
      }

      if (image.type !== 'image/webp') {
        return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Generated question assets must be WebP images')
      }

      if (image.size < 1 || image.size > MAX_ASSET_BYTES) {
        return jsonError(c, 400, 'VALIDATION_ERROR', 'Image size must be between 1 byte and 10 MB')
      }

      let inspectedImage
      try {
        inspectedImage = await inspectImageFile(image)
      } catch (error) {
        return jsonError(c, 400, 'INVALID_IMAGE', error.message)
      }

      if (
        segment.pixel_width !== inspectedImage.width
        || segment.pixel_height !== inspectedImage.height
      ) {
        return jsonError(c, 400, 'INVALID_IMAGE_METADATA', 'Image dimensions do not match pixel_width and pixel_height')
      }

      replacements.push({
        ...segment,
        accessible_text: typeof segment.accessible_text === 'string'
          ? segment.accessible_text.trim() || null
          : null,
        image: inspectedImage,
        r2Key: `exercise-question-assets/${exerciseId}/${setId}/${crypto.randomUUID()}.webp`,
      })
    }

    const oldAssetIds = oldAssets.results.map((asset) => asset.id)
    const oldAssetPlaceholders = oldAssetIds.map(() => '?').join(', ')
    const replacementRows = replacements.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
    let persisted = false

    try {
      await Promise.all(replacements.map((replacement) => c.env.BUCKET.put(
        replacement.r2Key,
        replacement.image.bytes,
        { httpMetadata: { contentType: replacement.image.mimeType } },
      )))

      const replacementBindings = replacements.flatMap((replacement) => [
        replacement.segment_index,
        replacement.source_page,
        replacement.x,
        replacement.y,
        replacement.width,
        replacement.height,
        replacement.r2Key,
        replacement.image.mimeType,
        replacement.image.bytes.byteLength,
        replacement.image.width,
        replacement.image.height,
        replacement.accessible_text,
        replacement.confidence,
      ])
      const batchResults = await c.env.DB.batch([
        c.env.DB.prepare(`
          delete from exercise_question_assets
          where id in (${oldAssetPlaceholders})
            and asset_set_id = ?
            and q_id = ?
            and rejected_at is not null
            and exists (
              select 1
              from exercise_question_asset_sets
              where id = ? and exercise_id = ? and confirmed_at is null
            )
        `).bind(...oldAssetIds, setId, qId, setId, exerciseId),
        c.env.DB.prepare(`
          with replacements (
            segment_index
            , source_page
            , x
            , y
            , width
            , height
            , r2_key
            , mime_type
            , file_size
            , pixel_width
            , pixel_height
            , accessible_text
            , confidence
          ) as (values ${replacementRows})
          insert into exercise_question_assets (
            asset_set_id
            , q_id
            , segment_index
            , source_kind
            , source_page
            , x
            , y
            , width
            , height
            , r2_key
            , mime_type
            , file_size
            , pixel_width
            , pixel_height
            , accessible_text
            , confidence
          )
          select
            ?
            , ?
            , segment_index
            , 'pdf_crop'
            , source_page
            , x
            , y
            , width
            , height
            , r2_key
            , mime_type
            , file_size
            , pixel_width
            , pixel_height
            , accessible_text
            , confidence
          from replacements
          where changes() = ?
            and exists (
              select 1
              from exercise_question_asset_sets
              where id = ? and exercise_id = ? and confirmed_at is null
            )
        `).bind(
          ...replacementBindings,
          setId,
          qId,
          oldAssetIds.length,
          setId,
          exerciseId,
        ),
      ])

      if (batchResults[1].meta.changes !== replacements.length) {
        await Promise.allSettled(replacements.map(({ r2Key }) => c.env.BUCKET.delete(r2Key)))
        return jsonError(c, 409, 'QUESTION_CHANGED', 'Question changed before retry completed')
      }
      persisted = true

      await Promise.allSettled(
        oldAssets.results.map((asset) => c.env.BUCKET.delete(asset.r2_key)),
      )

      const assets = await c.env.DB.prepare(`
        select *
        from exercise_question_assets
        where asset_set_id = ? and q_id = ?
        order by segment_index asc
      `).bind(setId, qId).all()

      return jsonSuccess(c, assets.results.map(toQuestionAssetResponse))
    } catch (error) {
      if (!persisted) {
        await Promise.allSettled(replacements.map(({ r2Key }) => c.env.BUCKET.delete(r2Key)))
      }
      console.error('Question retry error:', error)
      return jsonError(c, 500, 'QUESTION_RETRY_FAILED', 'Failed to retry question detection')
    }
  },
)

questionAssetsRoutes.put(
  '/:exerciseId/question-asset-sets/:setId/questions/:qId/screenshot',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = Number.parseInt(c.req.param('exerciseId'), 10)
    const setId = Number.parseInt(c.req.param('setId'), 10)
    const qId = Number.parseInt(c.req.param('qId'), 10)

    if (
      !Number.isInteger(exerciseId) || exerciseId < 1
      || !Number.isInteger(setId) || setId < 1
      || !Number.isInteger(qId) || qId < 1
    ) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Exercise, asset set, and question IDs must be positive integers')
    }

    const assetSet = await c.env.DB.prepare(`
      select id, confirmed_at
      from exercise_question_asset_sets
      where id = ? and exercise_id = ?
    `).bind(setId, exerciseId).first()

    if (!assetSet) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question asset set not found')
    }

    if (assetSet.confirmed_at) {
      return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
    }

    const oldAssets = await c.env.DB.prepare(`
      select id, r2_key, rejected_at
      from exercise_question_assets
      where asset_set_id = ? and q_id = ?
      order by segment_index asc
    `).bind(setId, qId).all()

    if (oldAssets.results.length === 0) {
      return jsonError(c, 404, 'NOT_FOUND', 'Question not found in this asset set')
    }

    if (oldAssets.results.some((asset) => !asset.rejected_at)) {
      return jsonError(c, 409, 'QUESTION_NOT_REJECTED', 'Reject the generated question before replacing it')
    }

    let body
    try {
      body = await c.req.parseBody()
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Request body must be multipart/form-data')
    }

    const image = body.image
    const allowedTypes = new Set(['image/webp', 'image/png', 'image/jpeg'])
    if (!(image instanceof File)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'image field is required')
    }

    if (!allowedTypes.has(image.type)) {
      return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PNG, JPEG, and WebP screenshots are accepted')
    }

    if (image.size < 1 || image.size > MAX_ASSET_BYTES) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Image size must be between 1 byte and 10 MB')
    }

    const accessibleText = typeof body.accessible_text === 'string'
      ? body.accessible_text.trim() || null
      : null
    const pixelWidth = parseInteger(body.pixel_width)
    const pixelHeight = parseInteger(body.pixel_height)
    if (!pixelWidth || !pixelHeight) {
      return jsonError(c, 400, 'INVALID_ASSET_METADATA', 'Screenshot dimensions are required')
    }

    let inspectedImage
    try {
      inspectedImage = await inspectImageFile(image)
    } catch (error) {
      return jsonError(c, 400, 'INVALID_IMAGE', error.message)
    }

    if (pixelWidth !== inspectedImage.width || pixelHeight !== inspectedImage.height) {
      return jsonError(c, 400, 'INVALID_IMAGE_METADATA', 'Image dimensions do not match pixel_width and pixel_height')
    }

    const extension = {
      'image/webp': 'webp',
      'image/png': 'png',
      'image/jpeg': 'jpg',
    }[image.type]
    const r2Key = `exercise-question-assets/${exerciseId}/${setId}/${crypto.randomUUID()}.${extension}`
    const oldAssetIds = oldAssets.results.map((asset) => asset.id)
    const oldAssetPlaceholders = oldAssetIds.map(() => '?').join(', ')
    let persisted = false

    try {
      await c.env.BUCKET.put(r2Key, inspectedImage.bytes, {
        httpMetadata: { contentType: inspectedImage.mimeType },
      })

      const batchResults = await c.env.DB.batch([
        c.env.DB.prepare(`
          delete from exercise_question_assets
          where id in (${oldAssetPlaceholders})
            and asset_set_id = ?
            and q_id = ?
            and rejected_at is not null
            and exists (
              select 1
              from exercise_question_asset_sets
              where id = ? and exercise_id = ? and confirmed_at is null
            )
        `).bind(...oldAssetIds, setId, qId, setId, exerciseId),
        c.env.DB.prepare(`
          insert into exercise_question_assets (
            asset_set_id
            , q_id
            , segment_index
            , source_kind
            , r2_key
            , mime_type
            , file_size
            , pixel_width
            , pixel_height
            , accessible_text
          )
          select ?, ?, 0, 'teacher_screenshot', ?, ?, ?, ?, ?, ?
          from exercise_question_asset_sets
          where id = ?
            and exercise_id = ?
            and confirmed_at is null
            and changes() = ?
        `).bind(
          setId,
          qId,
          r2Key,
          inspectedImage.mimeType,
          inspectedImage.bytes.byteLength,
          inspectedImage.width,
          inspectedImage.height,
          accessibleText,
          setId,
          exerciseId,
          oldAssetIds.length,
        ),
        c.env.DB.prepare(`
          update exercise_question_asset_sets
          set detection_method = case
            when detection_method = 'manual' then 'manual'
            else 'mixed'
          end
          where id = ?
            and exercise_id = ?
            and confirmed_at is null
            and exists (
              select 1
              from exercise_question_assets
              where r2_key = ?
            )
        `).bind(setId, exerciseId, r2Key),
      ])

      if (batchResults[1].meta.changes === 0) {
        await c.env.BUCKET.delete(r2Key)
        return jsonError(c, 409, 'SET_ALREADY_CONFIRMED', 'Confirmed question asset sets are immutable')
      }
      persisted = true

      await Promise.allSettled(
        oldAssets.results.map((asset) => c.env.BUCKET.delete(asset.r2_key)),
      )

      const replacement = await c.env.DB.prepare(`
        select *
        from exercise_question_assets
        where asset_set_id = ? and q_id = ? and segment_index = 0
      `).bind(setId, qId).first()

      return jsonSuccess(c, toQuestionAssetResponse(replacement))
    } catch (error) {
      if (!persisted) {
        await c.env.BUCKET.delete(r2Key).catch(() => {})
      }
      console.error('Question screenshot replacement error:', error)
      return jsonError(c, 500, 'SCREENSHOT_REPLACEMENT_FAILED', 'Failed to replace question screenshot')
    }
  },
)

function normalizeAnswerCandidate(candidate, assetSet) {
  if (!candidate || typeof candidate !== 'object') return { error: 'Candidate must be an object' }

  const qId = candidate.q_id
  const type = candidate.type
  const sourceKind = candidate.source_kind
  const confidence = candidate.confidence
  const subId = type === 'boolean'
    ? String(candidate.sub_id ?? '').trim().toLowerCase()
    : null
  const proposedAnswer = normalizeCorrectAnswer(type, candidate.proposed_answer)

  if (!Number.isInteger(qId) || qId < 1 || !ANSWER_TYPES.has(type)) {
    return { error: 'Candidate question and type are invalid' }
  }
  if (!ANSWER_SOURCE_KINDS.has(sourceKind)) return { error: 'Candidate source kind is invalid' }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { error: 'Candidate confidence must be between 0 and 1' }
  }
  if (
    (type === 'mcq' && !['A', 'B', 'C', 'D'].includes(proposedAnswer))
    || (type === 'boolean' && (!['a', 'b', 'c', 'd'].includes(subId) || !['0', '1'].includes(proposedAnswer)))
    || (type === 'numeric' && (proposedAnswer === '' || !Number.isFinite(Number(proposedAnswer))))
  ) {
    return { error: 'Candidate answer is invalid for its type' }
  }

  const expectedSourceFileId = sourceKind === 'answer_pdf_text'
    ? assetSet.answer_source_file_id
    : assetSet.source_file_id
  if (!expectedSourceFileId || candidate.source_file_id !== expectedSourceFileId) {
    return { error: 'Candidate source file does not match this asset set' }
  }

  const sourceGeometry = [
    candidate.source_x,
    candidate.source_y,
    candidate.source_width,
    candidate.source_height,
  ]
  if (sourceKind === 'exercise_green_highlight' && (
    !Number.isInteger(candidate.source_page) || candidate.source_page < 1
    || !validNormalizedRectangle(...sourceGeometry)
  )) {
    return { error: 'Green-highlight candidates require bounded source geometry' }
  }

  return {
    candidate: {
      q_id: qId,
      sub_id: subId,
      type,
      proposed_answer: proposedAnswer,
      source_kind: sourceKind,
      source_file_id: candidate.source_file_id,
      extractor_version: optionalText(candidate.extractor_version),
      model_id: optionalText(candidate.model_id),
      source_page: sourceKind === 'exercise_green_highlight' ? candidate.source_page : null,
      source_x: sourceKind === 'exercise_green_highlight' ? candidate.source_x : null,
      source_y: sourceKind === 'exercise_green_highlight' ? candidate.source_y : null,
      source_width: sourceKind === 'exercise_green_highlight' ? candidate.source_width : null,
      source_height: sourceKind === 'exercise_green_highlight' ? candidate.source_height : null,
      confidence,
    },
  }
}

function validNormalizedRectangle(x, y, width, height) {
  return Number.isFinite(x)
    && Number.isFinite(y)
    && Number.isFinite(width)
    && Number.isFinite(height)
    && x >= 0
    && y >= 0
    && width > 0
    && height > 0
    && x + width <= 1
    && y + height <= 1
}

function optionalText(value) {
  return typeof value === 'string' ? value.trim().slice(0, 200) || null : null
}

export default questionAssetsRoutes
