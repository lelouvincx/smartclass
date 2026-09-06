const MCQ_ANSWERS = ['A', 'B', 'C', 'D']
const BOOLEAN_SUB_IDS = ['a', 'b', 'c', 'd']
const STRUCTURAL_WARNING = 'Answer table structure was incomplete or ambiguous.'

function plainText(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchable(value) {
  return plainText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

function htmlTables(markdown) {
  return String(markdown ?? '').match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) ?? []
}

function tableRows(table) {
  const rows = []
  for (const rowMatch of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = []
    for (const cellMatch of rowMatch[1].matchAll(/<(?:td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)) {
      if (/\b(?:colspan|rowspan)\s*=\s*["']?(?!1(?:["']|\s|>|$))/i.test(cellMatch[1])) {
        return null
      }
      cells.push(plainText(cellMatch[2]))
    }
    if (!cells.length) return null
    rows.push(cells)
  }
  if (!rows.length || rows.some(row => row.length !== rows[0].length)) return null
  return rows
}

function localNumber(value) {
  const match = searchable(value).match(/^(?:(?:cau|q)\s*)?(\d+)$/)
  if (!match) return null
  const number = Number(match[1])
  return Number.isInteger(number) && number > 0 ? number : null
}

function normalizeNumeric(value) {
  const normalized = plainText(value)
    .replace(/[−–—]/g, '-')
    .replace(',', '.')
    .replace(/^\+/, '')
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null
  return Number.isFinite(Number(normalized)) ? normalized : null
}

function parseCompactMcq(rows) {
  const cells = rows.flat()
  const answers = cells.map((cell) => {
    const match = cell.match(/^(\d+)\s*[.)]\s*([A-D])$/i)
    return match ? { local: Number(match[1]), answer: match[2].toUpperCase() } : null
  })
  if (!answers.length || answers.some(answer => !answer)) return null
  const locals = answers.map(answer => answer.local)
  if (new Set(locals).size !== locals.length) return null
  return answers.map(({ local, answer }) => ({
    local,
    type: 'mcq',
    cells: [{ sub_id: null, answer }],
  }))
}

function parseBooleanMatrix(rows) {
  if (rows.length !== 5 || rows[0].length < 1) return null
  const locals = rows[0].map(localNumber)
  if (locals.some(number => number === null) || new Set(locals).size !== locals.length) return null

  const byQuestion = locals.map(local => ({ local, type: 'boolean', cells: [] }))
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const expectedSubId = BOOLEAN_SUB_IDS[rowIndex - 1]
    for (let column = 0; column < rows[rowIndex].length; column += 1) {
      const match = rows[rowIndex][column].match(/^([a-d])\s*[.)]\s*([sSdDĐđ])$/u)
      if (!match || match[1].toLowerCase() !== expectedSubId) return null
      byQuestion[column].cells.push({
        sub_id: expectedSubId,
        answer: match[2].toUpperCase() === 'S' ? '0' : '1',
      })
    }
  }
  return byQuestion
}

function parseNumericMatrix(rows) {
  if (rows.length !== 2 || rows[0].length < 2) return null
  const firstLabel = searchable(rows[0][0])
  if (!/^(cau|q)(?:\b|\s|\/)/.test(firstLabel)) return null
  const locals = rows[0].slice(1).map(localNumber)
  const answers = rows[1].slice(1).map(normalizeNumeric)
  if (locals.some(value => value === null) || answers.some(value => value === null)) return null
  if (new Set(locals).size !== locals.length) return null
  return locals.map((local, index) => ({
    local,
    type: 'numeric',
    cells: [{ sub_id: null, answer: answers[index] }],
  }))
}

function parseAnswerTable(table) {
  const rows = tableRows(table)
  if (!rows) return null
  return parseCompactMcq(rows) || parseBooleanMatrix(rows) || parseNumericMatrix(rows)
}

function sectionContexts(text) {
  const source = String(text ?? '')
  const matches = [...source.matchAll(/(?:^|\s)(PHẦN|PHAN)\s+([IVXLCDM]+)(?=\b|[.\s:–—-])/giu)]

  return matches.map((match, index) => {
    const titleStart = match.index + match[0].search(/PHẦN|PHAN/iu)
    const nextStart = matches[index + 1]?.index ?? source.length
    const sectionText = source.slice(titleStart, nextStart).trim()
    const answerHeading = sectionText.search(/\s+(?:BẢNG\s+)?ĐÁP\s+ÁN(?:\b|\s|[:–—-])/iu)
    const exactTitle = (answerHeading < 0 ? sectionText : sectionText.slice(0, answerHeading)).trim()

    return {
      marker: match[2].toUpperCase(),
      title: match[1].toUpperCase() === 'PHẦN' ? exactTitle : null,
    }
  })
}

function sameQuestionShape(group) {
  const first = group[0]
  const firstSubIds = first.cells.map(cell => cell.sub_id ?? '').join(':')
  return group.every(question => (
    question.section.key === first.section.key
    && question.local === first.local
    && question.type === first.type
    && question.cells.map(cell => cell.sub_id ?? '').join(':') === firstSubIds
  ))
}

function mapOntoSchemaShape(questions, schemaShape, warnings) {
  const sourceSections = [...new Map(questions.map(question => [
    question.section.key,
    question.section,
  ])).values()]
  const targetSections = [...new Map(schemaShape.map(row => [
    row.section_key,
    { key: row.section_key, title: row.section_title },
  ])).values()]
  const sectionMap = new Map()
  for (const source of sourceSections) {
    const titleMatches = source.title === null
      ? []
      : targetSections.filter(target => target.title === source.title)
    if (titleMatches.length === 1) {
      sectionMap.set(source.key, titleMatches[0].key)
    } else if (sourceSections.length === 1 && targetSections.length === 1) {
      sectionMap.set(source.key, targetSections[0].key)
    } else if (source.title === null && sourceSections.length === targetSections.length) {
      sectionMap.set(source.key, targetSections[sourceSections.indexOf(source)].key)
    }
  }
  const candidates = new Map()

  for (const question of questions) {
    const sectionKey = sectionMap.get(question.section.key)
    if (!sectionKey) {
      warnings.push('An extracted answer section does not exist in the exercise schema.')
      continue
    }
    for (const cell of question.cells) {
      const key = `${sectionKey}:${question.local}:${question.type}:${cell.sub_id ?? ''}`
      if (!candidates.has(key)) candidates.set(key, [])
      candidates.get(key).push(cell.answer)
    }
  }

  return schemaShape.map(row => {
    const key = `${row.section_key}:${row.local_number}:${row.type}:${row.sub_id ?? ''}`
    const answers = candidates.get(key) ?? []
    if (answers.length > 1) {
      warnings.push('A duplicate or conflicting answer identity was rejected.')
    }
    return {
      ...row,
      correct_answer: answers.length === 1 ? answers[0] : '',
      confidence: null,
    }
  })
}

export function parseAnswerPdfPages(pages, { expectedQuestionCount, schemaShape } = {}) {
  if (!Array.isArray(pages)) throw new TypeError('pages must be an array')
  if (schemaShape !== undefined && !Array.isArray(schemaShape)) {
    throw new TypeError('schemaShape must be an array')
  }

  const warnings = []
  const questions = []
  const sections = []
  let currentSection = null

  for (const page of pages) {
    const contexts = sectionContexts(page?.text)
    const tables = htmlTables(page?.markdown)
    if (!tables.length) {
      warnings.push(`Page ${page?.page_number ?? '?'} has no supported answer table.`)
      continue
    }
    if (contexts.length > 1 && contexts.length !== tables.length) {
      warnings.push(`Page ${page?.page_number ?? '?'} has ambiguous section context.`)
      continue
    }
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      const context = contexts.length > 1 ? contexts[tableIndex] : contexts[0]
      if (context && context.marker !== currentSection?.marker) {
        currentSection = {
          key: `section-${sections.length + 1}`,
          marker: context.marker,
          title: context.title,
        }
        sections.push(currentSection)
      }
      if (!currentSection) {
        currentSection = { key: `section-${sections.length + 1}`, marker: null, title: null }
        sections.push(currentSection)
      }

      const table = tables[tableIndex]
      const parsed = parseAnswerTable(table)
      if (!parsed) {
        warnings.push(`Page ${page?.page_number ?? '?'} has an unsupported answer table.`)
        continue
      }
      for (const question of parsed) {
        questions.push({ ...question, section: currentSection })
      }
    }
  }

  const grouped = new Map()
  for (const question of questions) {
    const key = `${question.section.key}:${question.local}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(question)
  }

  const reconciled = []
  for (const group of grouped.values()) {
    if (group.length !== 1) {
      warnings.push(`A duplicate or conflicting answer identity was rejected.`)
      if (sameQuestionShape(group)) {
        reconciled.push({
          ...group[0],
          cells: group[0].cells.map(cell => ({ ...cell, answer: '' })),
        })
      } else {
        reconciled.push(null)
      }
    } else {
      reconciled.push(group[0])
    }
  }

  const schema = schemaShape
    ? mapOntoSchemaShape(reconciled.filter(Boolean), schemaShape, warnings)
    : reconciled.flatMap((question, index) => question ? question.cells.map(cell => ({
      q_id: index + 1,
      section_key: question.section.key,
      section_title: question.section.title,
      local_number: question.local,
      type: question.type,
      sub_id: cell.sub_id,
      correct_answer: cell.answer,
      confidence: null,
    })) : [])

  const questionCount = new Set(schema.map(row => row.q_id)).size
  if (expectedQuestionCount !== undefined
    && Number(expectedQuestionCount) !== questionCount) {
    warnings.push(`Expected ${expectedQuestionCount} questions but extracted ${questionCount}.`)
  }
  return { schema, warnings }
}

function markState(value) {
  const mark = plainText(value)
  if (['✓', '✔', '☑', 'x', 'X'].includes(mark)) return true
  if (['', 'Ο', 'O', '○', '◯', '☐'].includes(mark)) return false
  return null
}

function parseMarkedMcq(rows) {
  if (rows.length < 2 || rows[0].length !== 5) return null
  if (searchable(rows[0][0]).match(/^(cau|q)(?:\b|\s|\/)/) === null) return null
  if (rows[0].slice(1).map(value => value.toUpperCase()).join('') !== 'ABCD') return null
  const candidates = []
  for (const row of rows.slice(1)) {
    const local = localNumber(row[0])
    const states = row.slice(1).map(markState)
    if (!local || states.some(state => state === null) || states.filter(Boolean).length !== 1) return null
    candidates.push({
      local,
      type: 'mcq',
      sub_id: null,
      answer: MCQ_ANSWERS[states.indexOf(true)],
    })
  }
  return candidates
}

function parseMarkedBoolean(rows) {
  if (rows.length < 2 || rows[0].length !== 4) return null
  const header = rows[0].map(searchable)
  if (!/^(cau|q)(?:\b|\s|\/)/.test(header[0])
    || !/(part|y)(?:\b|\s|\/)/.test(header[1])
    || !/(true|dung)/.test(header[2])
    || !/(false|sai)/.test(header[3])) return null
  const candidates = []
  for (const row of rows.slice(1)) {
    const local = localNumber(row[0])
    const subId = plainText(row[1]).toLowerCase()
    const states = row.slice(2).map(markState)
    if (!local || !BOOLEAN_SUB_IDS.includes(subId)
      || states.some(state => state === null) || states.filter(Boolean).length !== 1) return null
    candidates.push({
      local,
      type: 'boolean',
      sub_id: subId,
      answer: states[0] ? '1' : '0',
    })
  }
  return candidates
}

function parseDirectBoolean(rows) {
  if (rows.length < 2 || rows[0].length !== 3) return null
  const header = rows[0].map(searchable)
  if (!/^(cau|q)(?:\b|\s|\/)/.test(header[0])
    || !/(part|y)(?:\b|\s|\/)/.test(header[1])
    || !/(true|false|dung|sai)/.test(header[2])) return null

  const candidates = []
  for (const row of rows.slice(1)) {
    const local = localNumber(row[0])
    const subId = plainText(row[1]).toLowerCase()
    const value = plainText(row[2]).toUpperCase()
    if (!local || !BOOLEAN_SUB_IDS.includes(subId) || !['D', 'Đ', 'S'].includes(value)) return null
    candidates.push({
      local,
      type: 'boolean',
      sub_id: subId,
      answer: value === 'S' ? '0' : '1',
    })
  }
  return candidates
}

function parseStudentNumeric(rows) {
  if (rows.length < 2 || rows[0].length !== 2) return null
  const header = rows[0].map(searchable)
  if (!/^(cau|q)(?:\b|\s|\/)/.test(header[0]) || !/(answer|tra loi)/.test(header[1])) return null
  const candidates = []
  for (const row of rows.slice(1)) {
    const local = localNumber(row[0])
    const answer = normalizeNumeric(row[1])
    if (!local || answer === null) return null
    candidates.push({ local, type: 'numeric', sub_id: null, answer })
  }
  return candidates
}

function parseStudentTable(table) {
  const rows = tableRows(table)
  if (!rows) return null
  return parseMarkedMcq(rows)
    || parseMarkedBoolean(rows)
    || parseDirectBoolean(rows)
    || parseStudentNumeric(rows)
}

function answerKey(qId, subId) {
  return `${qId}:${subId ?? ''}`
}

export function parseStudentPhotoAnswers(markdown, pinnedSchema) {
  if (!Array.isArray(pinnedSchema)) throw new TypeError('pinnedSchema must be an array')

  const tables = htmlTables(markdown)
  let unsafe = tables.length === 0
  const candidates = []
  for (const table of tables) {
    const parsed = parseStudentTable(table)
    if (!parsed) unsafe = true
    else candidates.push(...parsed)
  }

  const schemaMatches = new Map()
  for (const row of pinnedSchema) {
    const descriptor = `${row.type}:${row.local_number ?? row.q_id}:${row.sub_id ?? ''}`
    if (!schemaMatches.has(descriptor)) schemaMatches.set(descriptor, [])
    schemaMatches.get(descriptor).push(row)
  }

  const candidatesByKey = new Map()
  for (const candidate of candidates) {
    const descriptor = `${candidate.type}:${candidate.local}:${candidate.sub_id ?? ''}`
    const matches = schemaMatches.get(descriptor) ?? []
    if (matches.length !== 1) {
      unsafe = true
      continue
    }
    const key = answerKey(matches[0].q_id, matches[0].sub_id)
    if (!candidatesByKey.has(key)) candidatesByKey.set(key, [])
    candidatesByKey.get(key).push(candidate.answer)
  }

  const extracted = new Map()
  for (const [key, values] of candidatesByKey) {
    if (values.length !== 1) unsafe = true
    else extracted.set(key, values[0])
  }

  const answers = pinnedSchema.map(row => ({
    q_id: row.q_id,
    sub_id: row.sub_id ?? null,
    answer: unsafe && tables.some(table => parseStudentTable(table) === null)
      ? null
      : (extracted.get(answerKey(row.q_id, row.sub_id)) ?? null),
    confidence: null,
  }))

  if (answers.some(row => row.answer === null)) unsafe = true
  return { answers, warnings: unsafe ? [STRUCTURAL_WARNING] : [] }
}
