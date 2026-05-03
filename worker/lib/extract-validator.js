// Validate and normalize the LLM's extracted-answers JSON against the exercise schema.
// Pure function — no DB, no fetch. Mirrors the spirit of schema-parser.js but for student answers.
//
// Input:
//   content : string  — raw text/JSON from the LLM (may include code fences)
//   schema  : Array<{ q_id: number, sub_id: string|null, type: 'mcq'|'boolean'|'numeric' }>
//
// Output:
//   { answers: Array<{ q_id, sub_id, answer, confidence }>, warnings: string[] }
//
// Behavior:
//   - Throws (with .code = 'PARSE_ERROR') when JSON is unrecoverable.
//   - Drops rows whose (q_id, sub_id) is not present in the schema (warns).
//   - Normalizes per type (uppercase MCQ; trim numeric; coerce boolean to '1'/'0').
//   - For schema rows the model omitted, emits { answer: null, confidence: 0 }.
//   - Always returns one entry per schema row, in (q_id ASC, sub_id ASC) order.

const VALID_MCQ = new Set(['A', 'B', 'C', 'D'])

export class ExtractParseError extends Error {
  constructor(message) {
    super(message)
    this.code = 'PARSE_ERROR'
    this.name = 'ExtractParseError'
  }
}

export function stripCodeFences(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim()
}

function normalizeAnswer(type, raw) {
  if (raw === null || raw === undefined) return null
  const value = String(raw).trim()
  if (value === '') return null

  if (type === 'mcq') {
    return value.toUpperCase()
  }
  if (type === 'boolean') {
    const lower = value.toLowerCase()
    if (['t', 'true', '1', 'yes', 'y'].includes(lower)) return '1'
    if (['f', 'false', '0', 'no', 'n'].includes(lower)) return '0'
    return lower
  }
  // numeric — keep as trimmed string (matches existing answer normalization rules)
  return value
}

function clampConfidence(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function schemaKey(qId, subId) {
  return `${qId}:${subId ?? ''}`
}

/**
 * Validate the LLM JSON output against the schema.
 * @param {string} content
 * @param {Array<{q_id:number, sub_id:string|null, type:string}>} schema
 * @returns {{answers: Array<{q_id:number, sub_id:string|null, answer:string|null, confidence:number}>, warnings:string[]}}
 */
export function validateExtractedAnswers(content, schema) {
  if (!Array.isArray(schema)) {
    throw new TypeError('schema must be an array')
  }

  let parsed
  try {
    parsed = JSON.parse(stripCodeFences(content))
  } catch (err) {
    throw new ExtractParseError(`Model output was not valid JSON: ${err.message}`)
  }

  const rows = Array.isArray(parsed) ? parsed : parsed?.answers
  if (!Array.isArray(rows)) {
    throw new ExtractParseError('Model output does not contain an answers array')
  }

  // Index schema by key for O(1) membership + type lookup.
  const schemaByKey = new Map()
  for (const row of schema) {
    schemaByKey.set(schemaKey(row.q_id, row.sub_id ?? null), {
      q_id: row.q_id,
      sub_id: row.sub_id ?? null,
      type: row.type,
    })
  }

  const warnings = []
  const extractedByKey = new Map() // schemaKey -> { answer, confidence }

  for (const row of rows) {
    const qIdRaw = row?.q_id
    const qId = Number.isInteger(qIdRaw) ? qIdRaw : Number.parseInt(String(qIdRaw ?? ''), 10)
    if (!Number.isInteger(qId)) {
      warnings.push(`Dropped row with non-integer q_id: ${JSON.stringify(qIdRaw)}`)
      continue
    }
    const subId = row?.sub_id ?? null
    const key = schemaKey(qId, subId)
    const schemaRow = schemaByKey.get(key)
    if (!schemaRow) {
      warnings.push(`Q${qId}${subId ? ` sub ${subId}` : ''}: not in schema, dropped`)
      continue
    }

    if (extractedByKey.has(key)) {
      warnings.push(`Q${qId}${subId ? ` sub ${subId}` : ''}: duplicate row, kept first`)
      continue
    }

    const answer = normalizeAnswer(schemaRow.type, row?.answer)
    const confidence = clampConfidence(row?.confidence)

    // Per-type validation: drop values that the grader could never accept.
    let finalAnswer = answer
    if (answer !== null) {
      if (schemaRow.type === 'mcq' && !VALID_MCQ.has(answer)) {
        warnings.push(`Q${qId}: '${answer}' is not a valid MCQ answer (A/B/C/D), dropped`)
        finalAnswer = null
      } else if (schemaRow.type === 'boolean' && !['0', '1'].includes(answer)) {
        warnings.push(`Q${qId} sub ${subId}: '${row?.answer}' is not a valid boolean answer, dropped`)
        finalAnswer = null
      } else if (schemaRow.type === 'numeric' && !Number.isFinite(Number(answer))) {
        warnings.push(`Q${qId}: '${answer}' is not a valid numeric answer, kept as-is`)
        // numeric: keep the raw string (grader treats unparseable values as wrong)
      }
    }

    extractedByKey.set(key, {
      q_id: schemaRow.q_id,
      sub_id: schemaRow.sub_id,
      answer: finalAnswer,
      confidence: finalAnswer === null ? Math.min(confidence, 0.3) : confidence,
    })
  }

  // Backfill any schema rows the model didn't return.
  const sortedSchema = [...schemaByKey.values()].sort((a, b) => {
    if (a.q_id !== b.q_id) return a.q_id - b.q_id
    return String(a.sub_id ?? '').localeCompare(String(b.sub_id ?? ''))
  })

  const answers = sortedSchema.map((s) => {
    const key = schemaKey(s.q_id, s.sub_id)
    return (
      extractedByKey.get(key) ?? {
        q_id: s.q_id,
        sub_id: s.sub_id,
        answer: null,
        confidence: 0,
      }
    )
  })

  return { answers, warnings }
}
