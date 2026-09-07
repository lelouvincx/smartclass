const TOTAL_HUNDREDTHS = 1000
const TYPE_WEIGHTS = { mcq: 0.25, numeric: 0.5, boolean: 1 }

export function scoreQuestions(rows) {
  const questions = new Map()
  for (const row of rows || []) {
    const qId = Number(row.q_id)
    if (!Number.isFinite(qId) || questions.has(qId)) continue
    questions.set(qId, {
      qId,
      type: row.type,
      sectionKey: row.section_key ?? 'main',
      sectionTitle: row.section_title ?? null,
      localNumber: Number(row.local_number ?? row.q_id),
    })
  }
  return [...questions.values()]
}

function distributeByWeights(questions, getWeight) {
  if (questions.length === 0 || questions.length > TOTAL_HUNDREDTHS) return null
  const totalWeight = questions.reduce((sum, question) => sum + getWeight(question), 0)
  if (totalWeight <= 0) return null

  const shares = questions.map((question) => {
    const exact = TOTAL_HUNDREDTHS * getWeight(question) / totalWeight
    return { qId: question.qId, value: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let remaining = TOTAL_HUNDREDTHS - shares.reduce((sum, share) => sum + share.value, 0)
  shares
    .slice()
    .sort((left, right) => right.remainder - left.remainder || left.qId - right.qId)
    .slice(0, remaining)
    .forEach((share) => {
      shares.find(item => item.qId === share.qId).value += 1
      remaining -= 1
    })

  if (shares.some(share => share.value < 1)) return null
  return Object.fromEntries(shares.map(share => [share.qId, share.value]))
}

export function distributeEqualPoints(rows) {
  return distributeByWeights(scoreQuestions(rows), () => 1)
}

export function distributeTypeProportions(rows) {
  return distributeByWeights(scoreQuestions(rows), question => TYPE_WEIGHTS[question.type] ?? 0)
}

export function relativeWeight(type) {
  return TYPE_WEIGHTS[type] ?? 0
}

export function formatHundredths(value) {
  return (Number(value) / 100).toFixed(2)
}

export function parsePointsToHundredths(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, decimals = ''] = text.split('.')
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
}

export function validateCustomAllocation(rows, values) {
  const questions = scoreQuestions(rows)
  const errors = {}
  let totalHundredths = 0

  for (const question of questions) {
    const raw = String(values?.[question.qId] ?? '').trim()
    const parsed = parsePointsToHundredths(raw)
    if (!raw) errors[question.qId] = 'required'
    else if (parsed === null) errors[question.qId] = 'decimal'
    else if (parsed < 1 || parsed > TOTAL_HUNDREDTHS) errors[question.qId] = 'range'
    else totalHundredths += parsed
  }

  return {
    valid: questions.length > 0
      && questions.length <= TOTAL_HUNDREDTHS
      && Object.keys(errors).length === 0
      && totalHundredths === TOTAL_HUNDREDTHS,
    errors,
    totalHundredths,
  }
}

export function applyScoreAllocation(rows, mode, values) {
  return (rows || []).map(row => ({
    ...row,
    max_score_hundredths: mode === 'custom'
      ? parsePointsToHundredths(values?.[Number(row.q_id)])
      : null,
  }))
}

export function allocationStateFromSchema(schema) {
  const questions = scoreQuestions(schema)
  const isCustom = questions.length > 0 && questions.every((question) => {
    const row = (schema || []).find(item => Number(item.q_id) === question.qId)
    return Number.isInteger(row?.max_score_hundredths)
  })
  return {
    mode: isCustom ? 'custom' : 'automatic',
    values: isCustom
      ? Object.fromEntries(questions.map((question) => {
        const row = schema.find(item => Number(item.q_id) === question.qId)
        return [question.qId, formatHundredths(row.max_score_hundredths)]
      }))
      : {},
  }
}
