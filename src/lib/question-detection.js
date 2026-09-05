export const QUESTION_DETECTOR_VERSION = 'text-geometry-v2'

const CONFIDENCE = 0.8
const QUESTION_MARKER = /^\s*(?:câu|question)\s+(\d+)(?=\s|[:.)-]|$)/iu
const SECTIONED_QUESTION_MARKER = /^\s*(?:câu|question)\s+(\d+)\s*[.)-]/iu
const SOLUTION_MARKER = /^\s*(?:lời\s*giải|đáp\s*án|đáp\s*số|solution|answer)(?=\s|[:.)-]|$)/iu
const SECTION_MARKER = /^\s*(?:phần|part|section)\s+(?:\d+|[ivxlcdm]+)\s*[:.)-]/iu

export class QuestionDetectionError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'QuestionDetectionError'
    this.code = code
    this.details = details
  }
}

/**
 * Detect question crops from ordered, top-left PDF text geometry.
 * Questions are returned in the first-occurrence order of expected questions.
 */
export function detectQuestionRegions(pages, expectedQuestions) {
  const expected = validateExpectedQuestions(expectedQuestions)
  const normalizedPages = validatePages(pages)
  const events = collectEvents(normalizedPages, expected)
  const markers = events.filter(event => event.type === 'question')
  validateMarkers(markers, expected)

  const byId = new Map(markers.map(marker => [marker.qId, marker]))
  const warnings = []
  const questions = expected.descriptors.map(descriptor => buildQuestion(
    descriptor.q_id,
    byId.get(descriptor.q_id),
    markers,
    events,
    normalizedPages,
    warnings,
  ))

  return {
    detectorVersion: QUESTION_DETECTOR_VERSION,
    detectionMethod: 'text',
    pageCount: normalizedPages.length,
    questions,
    warnings,
  }
}

function validateExpectedQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) fail('INVALID_EXPECTED_QUESTION_IDS', 'Expected questions must be a non-empty array')
  const result = []
  const byId = new Map()
  for (const question of questions) {
    const descriptor = Number.isSafeInteger(question)
      ? { q_id: question, section_key: 'main', section_title: null, local_number: question }
      : question
    if (!descriptor || !positiveInteger(descriptor.q_id) || typeof descriptor.section_key !== 'string' ||
        !descriptor.section_key || (descriptor.section_title !== null && typeof descriptor.section_title !== 'string') ||
        !positiveInteger(descriptor.local_number)) {
      fail('INVALID_EXPECTED_QUESTION_IDS', 'Expected questions must be positive IDs or valid descriptors')
    }
    const previous = byId.get(descriptor.q_id)
    if (previous && (previous.section_key !== descriptor.section_key || previous.local_number !== descriptor.local_number)) {
      fail('INVALID_EXPECTED_QUESTION_IDS', `Question ${descriptor.q_id} has conflicting descriptors`, { qId: descriptor.q_id })
    }
    if (!previous) {
      const normalized = { ...descriptor }
      byId.set(normalized.q_id, normalized)
      result.push(normalized)
    }
  }

  const byLocation = new Map()
  for (const descriptor of result) {
    const location = descriptorKey(descriptor.section_key, descriptor.local_number)
    byLocation.set(location, [...(byLocation.get(location) || []), descriptor])
  }
  const ambiguous = [...byLocation].find(([, descriptors]) => descriptors.length > 1)
  if (ambiguous) {
    const [sectionKey, localNumber] = ambiguous[0].split('\0')
    fail('AMBIGUOUS_QUESTION_DESCRIPTOR_MAPPING', 'More than one question descriptor maps to the same section and local number', {
      sectionKey,
      localNumber: Number(localNumber),
    })
  }
  return {
    descriptors: result,
    byLocation,
    sectionAware: result.some(descriptor => descriptor.section_key !== 'main'),
    sectionKeys: [...new Set(result
      .map(descriptor => descriptor.section_key)
      .filter(sectionKey => sectionKey !== 'main'))],
  }
}

function validatePages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) fail('INVALID_PAGE_GEOMETRY', 'At least one page is required')
  return pages.map((page, pageIndex) => {
    if (!page || page.pageNumber !== pageIndex + 1 || !positive(page.width) || !positive(page.height) || !Array.isArray(page.items)) {
      fail('INVALID_PAGE_GEOMETRY', 'Pages must be sequential and have positive finite dimensions', { pageIndex })
    }
    const items = page.items.map((item, itemIndex) => {
      const validIndex = Number.isSafeInteger(item?.itemIndex) && item.itemIndex >= 0
      if (!item || typeof item.text !== 'string' || !validIndex || !finite(item.x) || !finite(item.top) ||
          !positive(item.width) || !positive(item.height) || item.x < 0 || item.top < 0 ||
          item.x + item.width > page.width || item.top + item.height > page.height) {
        fail('INVALID_PAGE_GEOMETRY', 'Text item geometry must be finite, non-empty, and inside its page', { pageNumber: page.pageNumber, itemIndex })
      }
      return { ...item, text: item.text.trim() }
    }).filter(item => item.text)
    if (items.length === 0) {
      fail('SCANNED_OR_IMAGE_ONLY_PAGE', 'Text detection cannot process a page without extractable text', { pageNumber: page.pageNumber })
    }
    return { ...page, items }
  })
}

function collectEvents(pages, expected) {
  const events = []
  for (const page of pages) {
    for (const item of page.items) {
      const question = item.text.match(expected.sectionAware ? SECTIONED_QUESTION_MARKER : QUESTION_MARKER)
      if (question) events.push({ type: 'question', localNumber: Number(question[1]), pageNumber: page.pageNumber, item })
      if (SOLUTION_MARKER.test(item.text)) events.push({ type: 'solution', pageNumber: page.pageNumber, item })
      if (SECTION_MARKER.test(item.text)) events.push({ type: 'section', pageNumber: page.pageNumber, item })
    }
  }
  const ordered = events.sort(compareEvents)
  if (!expected.sectionAware) {
    for (const event of ordered) {
      if (event.type === 'question') {
        event.qId = expected.byLocation.get(descriptorKey('main', event.localNumber))?.[0].q_id ?? event.localNumber
      }
    }
    return ordered
  }

  let sectionIndex = -1
  let sectionKey = 'main'
  const seenLocations = new Set()
  const lastLocalNumber = new Map()
  for (const event of ordered) {
    if (event.type === 'section') {
      sectionIndex += 1
      sectionKey = expected.sectionKeys[sectionIndex] ?? `section-${sectionIndex + 1}`
      continue
    }
    if (event.type !== 'question') continue

    const location = descriptorKey(sectionKey, event.localNumber)
    if (seenLocations.has(location)) {
      fail('DUPLICATE_QUESTION_MARKER', `Question ${event.localNumber} has more than one marker in ${sectionKey}`, {
        sectionKey,
        localNumber: event.localNumber,
      })
    }
    const previousLocalNumber = lastLocalNumber.get(sectionKey)
    if (previousLocalNumber !== undefined && event.localNumber < previousLocalNumber) {
      fail('UNHEADED_SECTION_RESET', 'Question numbering reset without a section heading', {
        sectionKey,
        previousLocalNumber,
        localNumber: event.localNumber,
      })
    }
    seenLocations.add(location)
    lastLocalNumber.set(sectionKey, event.localNumber)

    const descriptors = expected.byLocation.get(location)
    if (!descriptors) {
      if (sectionKey === 'main') {
        fail('QUESTION_BEFORE_REQUIRED_SECTION', `Question ${event.localNumber} appears before a required section heading`, {
          localNumber: event.localNumber,
        })
      }
      fail('MISSING_QUESTION_DESCRIPTOR_MAPPING', 'No question descriptor matches the detected section and local number', {
        sectionKey,
        localNumber: event.localNumber,
      })
    }
    event.qId = descriptors[0].q_id
    event.sectionKey = sectionKey
  }
  return ordered
}

function validateMarkers(markers, expected) {
  const expectedIds = expected.descriptors.map(descriptor => descriptor.q_id)
  const expectedSet = new Set(expectedIds)
  const counts = new Map()
  for (const marker of markers) counts.set(marker.qId, (counts.get(marker.qId) || 0) + 1)
  const duplicate = [...counts].find(([, count]) => count > 1)?.[0]
  if (duplicate !== undefined) fail('DUPLICATE_QUESTION_MARKER', `Question ${duplicate} has more than one marker`, { qId: duplicate })
  const unexpected = markers.find(marker => !expectedSet.has(marker.qId))
  if (unexpected) fail('UNEXPECTED_QUESTION_MARKER', `Unexpected question marker ${unexpected.qId}`, { qId: unexpected.qId })
  const missing = expectedIds.find(qId => !counts.has(qId))
  if (missing !== undefined) fail('MISSING_QUESTION_MARKER', `Missing marker for question ${missing}`, { qId: missing })
}

function buildQuestion(qId, start, allQuestions, events, pages, warnings) {
  const questionPosition = allQuestions.indexOf(start)
  const previous = allQuestions[questionPosition - 1]
  const next = allQuestions[questionPosition + 1]
  const beforeStart = events.filter(event => isAfter(event, previous) && isBefore(event, start))
  const precedingSolution = beforeStart.filter(event => event.type === 'solution').at(-1)
  const heading = beforeStart.filter(event => event.type === 'section' && (!precedingSolution || isAfter(event, precedingSolution))).at(-1)
  const following = events.filter(event => isAfter(event, start) && (!next || isBeforeOrSame(event, next)))
  const limit = following.find(event => event.type === 'solution' || event === next) || next
  const headingBeforeNext = next && events.find(event => event.type === 'section' && isAfter(event, start) && isBefore(event, next))
  const boundary = limit === next && headingBeforeNext ? headingBeforeNext : limit
  const endPage = boundary?.pageNumber ?? pages.length
  const segments = []

  for (let pageNumber = start.pageNumber; pageNumber <= endPage; pageNumber += 1) {
    const page = pages[pageNumber - 1]
    const topAnchor = heading?.pageNumber === pageNumber ? heading.item : start.item
    const topFloor = precedingSolution?.pageNumber === pageNumber
      ? precedingSolution.item.top + precedingSolution.item.height
      : 0
    const top = pageNumber === start.pageNumber
      ? Math.max(topFloor, topAnchor.top - (heading?.pageNumber === pageNumber ? 0 : questionPadding(topAnchor)))
      : 0
    const bottom = pageNumber === endPage && boundary
      ? Math.max(0, boundary.item.top - boundaryPadding(boundary))
      : page.height
    if (!(bottom > top)) continue

    const selected = page.items
      .filter(item => item.top + item.height > top && item.top < bottom)
      .sort((a, b) => a.top - b.top || a.x - b.x || a.itemIndex - b.itemIndex)
    const accessibleText = selected.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim()
    if (!accessibleText && boundary?.type === 'question') {
      continue
    }
    if (selected.some(item => SOLUTION_MARKER.test(item.text)) || SOLUTION_MARKER.test(accessibleText)) {
      fail('SOLUTION_MARKER_CONTAMINATION', 'A detected segment contains a solution marker', { qId, pageNumber })
    }

    const margin = Math.min(32, page.width * 0.05)
    const x = margin / page.width
    const width = (page.width - margin * 2) / page.width
    const segment = {
      segmentIndex: segments.length,
      sourcePage: pageNumber,
      x: round(x),
      y: round(top / page.height),
      width: round(width),
      height: round((bottom - top) / page.height),
      accessibleText,
      confidence: CONFIDENCE,
      _topAnchorY: pageNumber === start.pageNumber ? round(topAnchor.top / page.height) : null,
      _topAnchorType: pageNumber === start.pageNumber
        ? (heading?.pageNumber === pageNumber ? 'section' : 'question')
        : null,
      _topFloorY: pageNumber === start.pageNumber ? round(topFloor / page.height) : 0,
      _bottomAnchorY: pageNumber === endPage && boundary
        ? round(boundary.item.top / page.height)
        : null,
      _bottomAnchorType: pageNumber === endPage && boundary ? boundary.type : null,
    }
    if (!validRect(segment)) fail('INVALID_SEGMENT_RECTANGLE', 'Detected rectangle is empty or out of bounds', { qId, pageNumber })
    segments.push(segment)
  }
  if (segments.length === 0) fail('EMPTY_QUESTION_REGION', `Question ${qId} has no usable region`, { qId })
  return { qId, segments }
}

function compareEvents(a, b) {
  return a.pageNumber - b.pageNumber || a.item.top - b.item.top || a.item.itemIndex - b.item.itemIndex
}
function isAfter(a, b) { return !b || compareEvents(a, b) > 0 }
function isBefore(a, b) { return !b || compareEvents(a, b) < 0 }
function isBeforeOrSame(a, b) { return !b || compareEvents(a, b) <= 0 }
function finite(value) { return Number.isFinite(value) }
function positive(value) { return finite(value) && value > 0 }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0 }
function descriptorKey(sectionKey, localNumber) { return `${sectionKey}\0${localNumber}` }
function questionPadding(item) { return Math.min(34, item.height * 2.5) }
function verticalPadding(item) { return Math.min(12, item.height) }
function boundaryPadding(boundary) {
  if (boundary.type === 'section') return 0
  if (boundary.type === 'question') return questionPadding(boundary.item)
  return verticalPadding(boundary.item)
}
function round(value) { return Number(value.toFixed(6)) }
function validRect(rect) {
  return [rect.x, rect.y, rect.width, rect.height].every(finite) && rect.x >= 0 && rect.y >= 0 &&
    rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1 && rect.y + rect.height <= 1
}
function fail(code, message, details) { throw new QuestionDetectionError(code, message, details) }
