export function answerCandidateKey(candidate) {
  return `${Number(candidate.q_id)}:${candidate.sub_id ?? ''}`
}

export function mergeAnswerCandidates(schema, candidates) {
  const rowsByKey = new Map((schema || []).map((row) => {
    const key = answerCandidateKey(row)
    return [key, {
      ...row,
      key,
      candidates: [],
      status: 'manual',
      hasConflict: false,
    }]
  }))
  const unexpected = []

  for (const candidate of candidates || []) {
    const key = answerCandidateKey(candidate)
    const row = rowsByKey.get(key)
    if (!row) {
      unexpected.push({ ...candidate, key })
      continue
    }
    row.candidates.push(candidate)
  }

  for (const row of rowsByKey.values()) {
    if (row.candidates.length === 0) continue

    const hasTypeMismatch = row.candidates.some(candidate => candidate.type !== row.type)
    const normalizedDraft = normalizeAnswer(row.type, row.correct_answer)
    const normalizedCandidates = row.candidates.map(candidate => (
      normalizeAnswer(candidate.type, candidate.proposed_answer)
    ))
    const distinctAnswers = new Set(normalizedCandidates)
    const disagreesWithDraft = normalizedCandidates.some(answer => answer !== normalizedDraft)

    if (hasTypeMismatch || distinctAnswers.size !== 1 || disagreesWithDraft) {
      row.status = 'conflict'
      row.hasConflict = true
      continue
    }

    const sourceKinds = new Set(row.candidates.map(candidate => candidate.source_kind))
    if (
      sourceKinds.has('answer_pdf_text')
      && sourceKinds.has('exercise_green_highlight')
    ) {
      row.status = 'agree'
    } else if (sourceKinds.has('answer_pdf_text')) {
      row.status = 'answer_pdf'
    } else if (sourceKinds.has('exercise_green_highlight')) {
      row.status = 'green_highlight'
    }
  }

  return {
    rows: [...rowsByKey.values()],
    unexpected,
  }
}

function normalizeAnswer(type, value) {
  const text = String(value ?? '').trim()
  if (type === 'numeric') {
    const number = Number(text)
    return Number.isFinite(number) ? String(number) : text
  }
  if (type === 'mcq') return text.toUpperCase()
  return text
}
