const SUPPORTED_TYPES = new Set(['mcq', 'boolean', 'numeric'])

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
    const lower = normalized.toLowerCase()
    if (['t', 'true'].includes(lower)) {
      return 'true'
    }
    if (['f', 'false'].includes(lower)) {
      return 'false'
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
    const type = normalizeType(row.type)
    const correctAnswer = normalizeCorrectAnswer(type, row.correct_answer)
    const confidence = Number.parseFloat(String(row.confidence ?? '0.8'))

    return {
      q_id: Number.isNaN(qid) ? null : qid,
      type,
      correct_answer: correctAnswer,
      confidence: Number.isNaN(confidence) ? 0.8 : confidence,
    }
  })
}

export function validateSchemaRows(rows) {
  const errors = []
  const seenQids = new Set()

  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 1}`

    if (!Number.isInteger(row.q_id) || row.q_id <= 0) {
      errors.push(`${rowLabel}: q_id must be a positive integer`)
    } else if (seenQids.has(row.q_id)) {
      errors.push(`${rowLabel}: duplicate q_id ${row.q_id}`)
    } else {
      seenQids.add(row.q_id)
    }

    if (!SUPPORTED_TYPES.has(row.type)) {
      errors.push(`${rowLabel}: unsupported type ${row.type}`)
      return
    }

    if (row.correct_answer === '') {
      errors.push(`${rowLabel}: correct_answer is required`)
      return
    }

    if (row.type === 'mcq' && !['A', 'B', 'C', 'D'].includes(row.correct_answer)) {
      errors.push(`${rowLabel}: mcq correct_answer must be A, B, C, or D`)
    }

    if (row.type === 'boolean' && !['true', 'false'].includes(row.correct_answer)) {
      errors.push(`${rowLabel}: boolean correct_answer must be true or false`)
    }

    if (row.type === 'numeric' && Number.isNaN(Number(row.correct_answer))) {
      errors.push(`${rowLabel}: numeric correct_answer must be a valid number`)
    }
  })

  return errors
}

export function buildConfidence(rows, threshold = 0.75) {
  if (!rows.length) {
    return { overall: 0, by_question: [] }
  }

  const byQuestion = rows.map((row) => ({ q_id: row.q_id, score: row.confidence }))
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
