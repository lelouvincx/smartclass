const SUPPORTED_TYPES = new Set(['mcq', 'boolean', 'numeric'])
const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']

export function stripCodeFences(value) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim()
}

export function normalizeCorrectAnswer(type, answer) {
  const normalized = String(answer ?? '').trim()

  if (type === 'mcq') {
    return normalized.toUpperCase()
  }

  if (type === 'boolean') {
    // Normalize T/true -> '1', F/false -> '0'. Accept '0'/'1' as-is.
    const lower = normalized.toLowerCase()
    if (['t', 'true', '1'].includes(lower)) {
      return '1'
    }
    if (['f', 'false', '0'].includes(lower)) {
      return '0'
    }
    return lower
  }

  return normalized
}

export function normalizeType(rawType) {
  const value = String(rawType ?? '').trim().toLowerCase()

  if (['mcq', 'multiple_choice', 'multiple-choice', 'choice'].includes(value)) {
    return 'mcq'
  }

  if (['boolean', 'bool', 'true_false', 'true-false'].includes(value)) {
    return 'boolean'
  }

  if (['numeric', 'number', 'integer', 'float'].includes(value)) {
    return 'numeric'
  }

  return value
}

export function parseModelSchemaContent(content) {
  const cleaned = stripCodeFences(content)
  const parsed = JSON.parse(cleaned)
  const rows = Array.isArray(parsed) ? parsed : parsed.schema

  if (!Array.isArray(rows)) {
    throw new Error('Model output does not contain a schema array')
  }

  return rows
}

export function normalizeSchemaRows(rows) {
  return rows.map((row) => {
    const qid = Number.parseInt(String(row.q_id ?? ''), 10)
    const isLegacyDescriptor = row.section_key === undefined
      && row.section_title === undefined
      && row.local_number === undefined
    const sectionKey = isLegacyDescriptor
      ? 'main'
      : String(row.section_key ?? '').trim()
    const rawSectionTitle = row.section_title
    const sectionTitle = rawSectionTitle === undefined || rawSectionTitle === null
      ? null
      : String(rawSectionTitle).trim() || null
    const localNumber = isLegacyDescriptor
      ? qid
      : Number.parseInt(String(row.local_number ?? ''), 10)
    const type = normalizeType(row.type)
    const correctAnswer = normalizeCorrectAnswer(type, row.correct_answer)
    const confidence = Number.parseFloat(String(row.confidence ?? '0'))

    // sub_id: pass through for boolean, null for mcq/numeric
    const subId = type === 'boolean'
      ? (row.sub_id ?? null)
      : null

    return {
      q_id: Number.isNaN(qid) ? null : qid,
      section_key: sectionKey,
      section_title: sectionTitle,
      local_number: Number.isNaN(localNumber) ? null : localNumber,
      type,
      sub_id: subId,
      correct_answer: correctAnswer,
      confidence: Number.isNaN(confidence) ? 0 : confidence,
    }
  })
}

export function validateSchemaRows(rows, { allowBlankAnswers = false } = {}) {
  const errors = []
  const seenKeys = new Set() // tracks "q_id" for mcq/numeric, "q_id:sub_id" for boolean
  const qidTypes = new Map() // q_id -> type (enforces one type per q_id)
  const booleanSubIds = new Map() // q_id -> Set of sub_ids seen
  const qidDescriptors = new Map() // q_id -> section descriptor
  const descriptorQids = new Map() // (section_key, local_number) -> q_id
  const sectionTitles = new Map() // section_key -> section_title

  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 1}`

    if (!Number.isInteger(row.q_id) || row.q_id <= 0) {
      errors.push(`${rowLabel}: q_id must be a positive integer`)
      return
    }

    // Rows without section fields are legacy rows. Treat their global q_id as
    // the local number in the implicit main section.
    const isLegacyDescriptor = row.section_key === undefined
      && row.section_title === undefined
      && row.local_number === undefined
    const sectionKey = isLegacyDescriptor ? 'main' : row.section_key
    const sectionTitle = row.section_title === undefined ? null : row.section_title
    const localNumber = isLegacyDescriptor ? row.q_id : row.local_number

    if (typeof sectionKey !== 'string' || sectionKey.trim() === '') {
      errors.push(`${rowLabel}: section_key is required`)
      return
    }

    if (!Number.isInteger(localNumber) || localNumber <= 0) {
      errors.push(`${rowLabel}: local_number must be a positive integer`)
      return
    }

    if (sectionTitle !== null && typeof sectionTitle !== 'string') {
      errors.push(`${rowLabel}: section_title must be a string or null`)
      return
    }

    const descriptor = JSON.stringify([sectionKey, sectionTitle, localNumber])
    const existingDescriptor = qidDescriptors.get(row.q_id)
    if (existingDescriptor && existingDescriptor !== descriptor) {
      errors.push(`${rowLabel}: q_id ${row.q_id} has conflicting section descriptor`)
      return
    }
    qidDescriptors.set(row.q_id, descriptor)

    const localKey = JSON.stringify([sectionKey, localNumber])
    const existingQid = descriptorQids.get(localKey)
    if (existingQid !== undefined && existingQid !== row.q_id) {
      errors.push(`${rowLabel}: (section_key, local_number) (${sectionKey}, ${localNumber}) already maps to q_id ${existingQid}`)
      return
    }
    descriptorQids.set(localKey, row.q_id)

    if (sectionTitles.has(sectionKey) && sectionTitles.get(sectionKey) !== sectionTitle) {
      errors.push(`${rowLabel}: section_key ${sectionKey} has conflicting section_title`)
      return
    }
    sectionTitles.set(sectionKey, sectionTitle)

    if (!SUPPORTED_TYPES.has(row.type)) {
      errors.push(`${rowLabel}: unsupported type ${row.type}`)
      return
    }

    // Enforce one type per q_id (prevents mixing boolean + mcq for same q_id)
    const existingType = qidTypes.get(row.q_id)
    if (existingType && existingType !== row.type) {
      errors.push(`${rowLabel}: q_id ${row.q_id} already used as ${existingType}, cannot reuse as ${row.type}`)
      return
    }
    qidTypes.set(row.q_id, row.type)

    if (row.correct_answer === '' && !allowBlankAnswers) {
      errors.push(`${rowLabel}: correct_answer is required`)
      return
    }

    if (row.type === 'boolean') {
      // Validate sub_id presence
      if (row.sub_id === null || row.sub_id === undefined) {
        errors.push(`${rowLabel}: boolean question must have sub_id (a, b, c, or d)`)
        return
      }

      // Validate sub_id value
      if (!BOOLEAN_SUB_IDS.includes(row.sub_id)) {
        errors.push(`${rowLabel}: boolean sub_id must be a, b, c, or d`)
        return
      }

      // Validate correct_answer is '0' or '1'
      if (row.correct_answer !== '' && !['0', '1'].includes(row.correct_answer)) {
        errors.push(`${rowLabel}: boolean correct_answer must be 0 or 1`)
        return
      }

      // Duplicate (q_id, sub_id) check
      const key = `${row.q_id}:${row.sub_id}`
      if (seenKeys.has(key)) {
        errors.push(`${rowLabel}: duplicate (q_id, sub_id) pair (${row.q_id}, ${row.sub_id})`)
        return
      }
      seenKeys.add(key)

      // Track sub_ids per boolean q_id for completeness check
      if (!booleanSubIds.has(row.q_id)) {
        booleanSubIds.set(row.q_id, new Set())
      }
      booleanSubIds.get(row.q_id).add(row.sub_id)
    } else {
      // mcq / numeric: no sub_id allowed
      if (row.type === 'mcq' && row.correct_answer !== '' && !['A', 'B', 'C', 'D'].includes(row.correct_answer)) {
        errors.push(`${rowLabel}: mcq correct_answer must be A, B, C, or D`)
      }

      if (row.type === 'numeric' && row.correct_answer !== '' && Number.isNaN(Number(row.correct_answer))) {
        errors.push(`${rowLabel}: numeric correct_answer must be a valid number`)
      }

      // Duplicate q_id check for non-boolean
      const key = String(row.q_id)
      if (seenKeys.has(key)) {
        errors.push(`${rowLabel}: duplicate q_id ${row.q_id}`)
        return
      }
      seenKeys.add(key)
    }
  })

  // Cross-row validation: each boolean q_id must have exactly a,b,c,d
  for (const [qid, subIds] of booleanSubIds.entries()) {
    const missing = BOOLEAN_SUB_IDS.filter((s) => !subIds.has(s))
    if (missing.length > 0) {
      errors.push(`q_id ${qid}: boolean question must have exactly sub-questions a, b, c, d`)
    }
  }

  return errors
}

export function buildConfidence(rows, threshold = 0.75) {
  if (!rows.length) {
    return { overall: 0, by_question: [] }
  }

  const byQuestion = rows.map((row) => ({ q_id: row.q_id, sub_id: row.sub_id ?? null, score: row.confidence }))
  const total = rows.reduce((sum, row) => sum + row.confidence, 0)

  return {
    overall: Number((total / rows.length).toFixed(4)),
    by_question: byQuestion,
    low_confidence_count: rows.filter((row) => row.confidence < threshold).length,
  }
}

export function buildWarnings(rows, threshold = 0.75) {
  const warnings = []
  const lowConfidenceRows = rows.filter((row) => row.confidence < threshold)

  if (lowConfidenceRows.length > 0) {
    warnings.push(`${lowConfidenceRows.length} question(s) were parsed with confidence below ${threshold}`)
  }

  return warnings
}
