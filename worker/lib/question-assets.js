export const MIN_QUESTION_ASSET_CONFIDENCE = 0.75

export function toQuestionAssetResponse(asset) {
  const { r2_key: _r2Key, ...data } = asset
  return {
    ...data,
    file_url: `/api/question-assets/${asset.id}`,
  }
}

export async function validateQuestionAssetSetForActivation(
  env,
  { exerciseId, setId, schemaRows, resolvedAnswerCandidateKeys = [] },
) {
  const assetSet = await env.DB.prepare(`
    select
      s.*
      , (
          select ef.id
          from exercise_files ef
          where ef.exercise_id = s.exercise_id and ef.file_type = 'exercise_pdf'
          order by ef.uploaded_at desc, ef.id desc
          limit 1
        ) as current_source_file_id
      , (
          select ef.id
          from exercise_files ef
          where ef.exercise_id = s.exercise_id and ef.file_type = 'solution_pdf'
          order by ef.uploaded_at desc, ef.id desc
          limit 1
        ) as current_answer_source_file_id
    from exercise_question_asset_sets s
    where s.id = ? and s.exercise_id = ?
  `).bind(setId, exerciseId).first()

  if (!assetSet) {
    return { error: 'Question asset set does not belong to this exercise' }
  }

  if (assetSet.confirmed_at) {
    return { error: 'Question asset set is already confirmed' }
  }

  if (assetSet.source_file_id !== assetSet.current_source_file_id) {
    return { error: 'Question asset set was generated from an outdated exercise PDF' }
  }

  if (assetSet.answer_source_file_id !== assetSet.current_answer_source_file_id) {
    return { error: 'Question asset set was generated from an outdated Answer PDF' }
  }

  if (assetSet.detection_method === 'vision') {
    return { error: 'Vision-generated question assets are not enabled' }
  }

  const pinnedSchema = await env.DB.prepare(`
    select q_id, section_key, section_title, local_number, sub_id, type, correct_answer
    from exercise_question_answer_schemas
    where asset_set_id = ?
    order by q_id asc, sub_id asc
  `).bind(setId).all()
  if (pinnedSchema.results.length === 0) {
    return { error: 'Question asset set has no pinned schema shape; generate a replacement set' }
  }
  if (!schemaShapesMatch(schemaRows, pinnedSchema.results)) {
    return { error: 'Question asset set schema shape changed after generation' }
  }
  const expectedQuestionIds = [...new Set(pinnedSchema.results.map(row => Number(row.q_id)))]

  const assets = await env.DB.prepare(`
    select *
    from exercise_question_assets
    where asset_set_id = ?
    order by q_id asc, segment_index asc
  `).bind(setId).all()

  const expected = new Set(expectedQuestionIds)
  const byQuestion = new Map()
  for (const asset of assets.results) {
    if (!expected.has(asset.q_id)) {
      return { error: `Question asset set contains unexpected question ${asset.q_id}` }
    }

    if (!byQuestion.has(asset.q_id)) {
      byQuestion.set(asset.q_id, [])
    }
    byQuestion.get(asset.q_id).push(asset)
  }

  for (const qId of expectedQuestionIds) {
    const segments = byQuestion.get(qId)
    if (!segments?.length) {
      return { error: `Question asset set is missing question ${qId}` }
    }

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment.segment_index !== index) {
        return { error: `Question ${qId} segments must be contiguous from index 0` }
      }
      if (segment.rejected_at) {
        return { error: `Question ${qId} is rejected` }
      }
      if (
        segment.source_kind === 'pdf_crop'
        && segment.confidence < MIN_QUESTION_ASSET_CONFIDENCE
      ) {
        return { error: `Question ${qId} is below the confidence threshold` }
      }
    }
  }

  const storedObjects = await Promise.all(
    assets.results.map((asset) => env.BUCKET.head(asset.r2_key)),
  )
  if (storedObjects.some((object) => object === null)) {
    return { error: 'Question asset upload is incomplete' }
  }

  const candidates = await env.DB.prepare(`
    select q_id, sub_id, type, proposed_answer
    from exercise_question_answer_candidates
    where asset_set_id = ?
  `).bind(setId).all()
  const schemaByKey = new Map(schemaRows.map(row => [answerKey(row), row]))
  const resolvedKeys = new Set(resolvedAnswerCandidateKeys.map(answerKey))

  for (const candidate of candidates.results) {
    const key = answerKey(candidate)
    const schemaRow = schemaByKey.get(key)
    const matchesSchema = schemaRow
      && schemaRow.type === candidate.type
      && answersMatch(candidate.type, schemaRow.correct_answer, candidate.proposed_answer)
    if (!matchesSchema && !resolvedKeys.has(key)) {
      return { error: `Question ${candidate.q_id} has an unresolved answer conflict` }
    }
  }

  return {
    assetSet,
    assets: assets.results,
    candidates: candidates.results,
    pinnedSchema: pinnedSchema.results,
  }
}

function schemaShapesMatch(proposedRows, pinnedRows) {
  if (proposedRows.length !== pinnedRows.length) return false
  const shape = rows => rows.map(row => ({
    q_id: Number(row.q_id),
    section_key: row.section_key ?? 'main',
    section_title: row.section_title ?? null,
    local_number: Number(row.local_number ?? row.q_id),
    sub_id: row.sub_id ?? null,
    type: row.type,
  })).sort((left, right) => (
    left.q_id - right.q_id
    || String(left.sub_id ?? '').localeCompare(String(right.sub_id ?? ''))
  ))
  return JSON.stringify(shape(proposedRows)) === JSON.stringify(shape(pinnedRows))
}

function answerKey(row) {
  return `${Number(row.q_id)}:${row.sub_id ?? ''}`
}

function answersMatch(type, left, right) {
  if (type === 'numeric') {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    return Number.isFinite(leftNumber) && leftNumber === rightNumber
  }
  if (type === 'mcq') {
    return String(left).trim().toUpperCase() === String(right).trim().toUpperCase()
  }
  return String(left).trim() === String(right).trim()
}
