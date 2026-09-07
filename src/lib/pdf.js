import { detectGreenHighlightRegions } from './answer-highlights'

let pdfjsPromise

const PDF_DPI = 150
const PDF_POINTS_PER_INCH = 72
const MAX_SELECTED_PAGES = 10
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_TOTAL_BYTES = 25 * 1024 * 1024
const MULTIPART_OVERHEAD_BUDGET = 64 * 1024
const GREEN_HIGHLIGHT_SCALE = 2
const QUESTION_MARKER = /^\s*(?:câu|question)\s+(\d+)(?=\s|[:.)-]|$)/iu
const QUESTION_WORD = /^\s*(?:câu|question)\s*$/iu
const QUESTION_NUMBER = /^\s*(\d+)\s*[:.)-]?\s*$/u
const OPTION_MARKER = /^\s*([A-D])\s*[.)]/i
const DETAILED_ANSWER_TOKEN = /(?:\b(?:c\s*a\s*u|q\s*u\s*e\s*s\s*t\s*i\s*o\s*n)\s+(\d+)\s*[:.)-]?)|(?:c\s*h\s*o\s*n\s+d\s*a\s*p\s+a\s*n\s*([a-d])\b)|(?:\bchoose\s+(?:answer\s+)?(?:option\s+)?([a-d])\b)/giu

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }

  return pdfjsPromise
}

function normalizePageText(items) {
  return items
    .map((item) => item.str || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeForDetection(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isAnswerTableCandidate(text) {
  const normalized = normalizeForDetection(text)
  const compact = normalized.replace(/\s+/g, '')

  if (/\b(?:bang\s*)?(?:dap\s*an|tra\s*loi)\b/.test(normalized)) return true
  if (compact.includes('bangdapan') || compact.includes('bangtraloi')) return true

  const compactAnswerPairs = normalized.match(/(?:^|\s)\d{1,3}\s*[.):\-]?\s*[abcd](?=\s|$)/g)
  if ((compactAnswerPairs?.length || 0) >= 3) return true

  const trueFalseCells = normalized.match(/(?:^|\s)[a-d]\s*[.):\-]?\s*(?:d|s)(?=\s|$)/g)
  return (trueFalseCells?.length || 0) >= 3 && /(?:^|\s)\d{1,3}(?=\s|$)/.test(normalized)
}

function mayAnswerTableContinue(text) {
  const normalized = normalizeForDetection(text)
  return !/\b(?:huong\s*dan\s*giai|loi\s*giai|giai\s*chi\s*tiet)\b/.test(normalized)
}

async function loadPdf(file, pdfjsOverride) {
  const pdfjs = pdfjsOverride || await getPdfjs()
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)
  return pdfjs.getDocument({ data }).promise
}

async function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new AnswerPdfPreparationError('RENDER_FAILED', 'Could not render the PDF page.'))
    }, 'image/png')
  })
}

export class AnswerPdfPreparationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AnswerPdfPreparationError'
    this.code = code
    this.recoverable = true
  }
}

export async function extractTextFromPdf(file, { pdfjs } = {}) {
  const pdf = await loadPdf(file, pdfjs)

  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(normalizePageText(content.items))
  }

  return pages.join('\n').trim()
}

export function extractGreenMcqAnswerRowsFromPageEvidence(pageEvidence) {
  const answers = new Map()
  const conflicts = new Set()
  const questionIds = new Set()

  for (const page of pageEvidence || []) {
    const textItems = [...(page.textItems || [])]
      .filter(item => item?.text)
      .sort((left, right) => left.y - right.y || left.x - right.x)
    const questionMarkers = questionMarkersFromTextItems(textItems)
    for (const marker of questionMarkers) questionIds.add(marker.qId)
    const optionLabels = textItems.flatMap((item) => {
      const match = item.text.match(OPTION_MARKER)
      return match ? [{ ...item, value: match[1].toUpperCase() }] : []
    })

    for (const region of page.regions || []) {
      const qId = questionForRegion(region, questionMarkers)
      const option = optionForGreenRegion(region, optionLabels)
      if (!qId || !option) continue

      const existing = answers.get(qId)
      if (existing && existing !== option) {
        conflicts.add(qId)
        continue
      }
      answers.set(qId, option)
    }
  }

  if (answers.size === 0) return []

  return [...questionIds]
    .sort((left, right) => left - right)
    .map((qId) => {
      const correctAnswer = conflicts.has(qId) ? '' : answers.get(qId) ?? ''
      return {
        q_id: qId,
        sub_id: null,
        type: 'mcq',
        correct_answer: correctAnswer,
        confidence: correctAnswer ? 1 : null,
      }
    })
}

export function extractDetailedAnswerKeyRowsFromText(text) {
  const answers = new Map()
  const conflicts = new Set()
  let currentQuestionId = null
  const normalized = normalizeForDetection(String(text || ''))
  const tokens = normalized.matchAll(DETAILED_ANSWER_TOKEN)

  for (const token of tokens) {
    if (token[1]) {
      currentQuestionId = Number(token[1])
      continue
    }

    const answer = (token[2] || token[3])?.toUpperCase()
    if (!answer || !currentQuestionId) continue

    const existing = answers.get(currentQuestionId)
    if (existing && existing !== answer) {
      conflicts.add(currentQuestionId)
      continue
    }
    answers.set(currentQuestionId, answer)
  }

  if (answers.size === 0) return []

  return [...answers]
    .sort(([left], [right]) => left - right)
    .map(([qId, answer]) => {
      const correctAnswer = conflicts.has(qId) ? '' : answer
      return {
        q_id: qId,
        sub_id: null,
        type: 'mcq',
        correct_answer: correctAnswer,
        confidence: correctAnswer ? 1 : null,
      }
    })
}

function questionMarkersFromTextItems(textItems) {
  return textItems.flatMap((item, index) => {
    const inlineMatch = item.text.match(QUESTION_MARKER)
    if (inlineMatch) return [{ ...item, qId: Number(inlineMatch[1]) }]

    if (!QUESTION_WORD.test(item.text)) return []
    const next = textItems[index + 1]
    const splitMatch = next?.text?.match(QUESTION_NUMBER)
    if (!splitMatch) return []

    const itemCenterY = item.y + item.height / 2
    const nextCenterY = next.y + next.height / 2
    const rowTolerance = Math.max(item.height, next.height) * 1.5 + 2
    if (Math.abs(itemCenterY - nextCenterY) > rowTolerance || next.x < item.x) return []

    return [{ ...item, qId: Number(splitMatch[1]) }]
  })
}

export async function extractGreenHighlightedAnswerSchema(file, { onProgress, pdfjs } = {}) {
  const pdf = await loadPdf(file, pdfjs)
  const evidence = []

  try {
    onProgress?.({ stage: 'reading', current: 0, total: pdf.numPages })
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const textItems = textItemsToTopLeftGeometry(viewport, content)
      onProgress?.({ stage: 'reading', current: pageNumber, total: pdf.numPages })

      const scaledViewport = page.getViewport({ scale: GREEN_HIGHLIGHT_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(scaledViewport.width)
      canvas.height = Math.ceil(scaledViewport.height)
      const canvasContext = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
      if (!canvasContext) {
        throw new AnswerPdfPreparationError('CANVAS_UNAVAILABLE', 'Could not inspect PDF highlights.')
      }
      await page.render({ canvasContext, viewport: scaledViewport }).promise
      const regions = detectGreenHighlightRegions(
        canvasContext.getImageData(0, 0, canvas.width, canvas.height),
      ).map(region => ({
        ...region,
        x: region.x / GREEN_HIGHLIGHT_SCALE,
        y: region.y / GREEN_HIGHLIGHT_SCALE,
        width: region.width / GREEN_HIGHLIGHT_SCALE,
        height: region.height / GREEN_HIGHLIGHT_SCALE,
      }))
      if (regions.length > 0) {
        evidence.push({ pageNumber, textItems, regions })
      }
      page.cleanup?.()
    }
  } finally {
    await pdf.destroy?.()
  }

  return extractGreenMcqAnswerRowsFromPageEvidence(evidence)
}

export async function extractDetailedAnswerKeySchema(file, { onProgress, pdfjs } = {}) {
  const pdf = await loadPdf(file, pdfjs)
  const pages = []

  try {
    onProgress?.({ stage: 'reading', current: 0, total: pdf.numPages })
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(normalizePageText(content.items))
      onProgress?.({ stage: 'reading', current: pageNumber, total: pdf.numPages })
      page.cleanup?.()
    }
  } finally {
    await pdf.destroy?.()
  }

  return extractDetailedAnswerKeyRowsFromText(pages.join('\n'))
}

export async function prepareAnswerPdfForParsing(file, { onProgress, pdfjs } = {}) {
  const pdf = await loadPdf(file, pdfjs)
  const pages = []

  onProgress?.({ stage: 'reading', current: 0, total: pdf.numPages })
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push({
      page,
      pageNumber,
      text: normalizePageText(content.items),
    })
    onProgress?.({ stage: 'reading', current: pageNumber, total: pdf.numPages })
  }

  const selectedNumbers = new Set()
  for (const { pageNumber, text } of pages) {
    if (!isAnswerTableCandidate(text)) continue
    selectedNumbers.add(pageNumber)
    if (pageNumber < pdf.numPages && mayAnswerTableContinue(text)) {
      selectedNumbers.add(pageNumber + 1)
    }
  }

  if (selectedNumbers.size === 0) {
    throw new AnswerPdfPreparationError(
      'UNSUPPORTED_DOCUMENT',
      'No readable answer table was found in this PDF.',
    )
  }
  if (selectedNumbers.size > MAX_SELECTED_PAGES) {
    throw new AnswerPdfPreparationError(
      'TOO_MANY_PAGES',
      `The answer tables span more than ${MAX_SELECTED_PAGES} pages.`,
    )
  }

  const selectedPages = pages.filter(({ pageNumber }) => selectedNumbers.has(pageNumber))
  const pageFiles = []
  const pageManifest = []
  let totalBytes = 0

  onProgress?.({ stage: 'rendering', current: 0, total: selectedPages.length })
  for (let index = 0; index < selectedPages.length; index += 1) {
    const { page, pageNumber, text } = selectedPages[index]
    const viewport = page.getViewport({ scale: PDF_DPI / PDF_POINTS_PER_INCH })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const canvasContext = canvas.getContext('2d')

    await page.render({ canvasContext, viewport }).promise
    const png = await canvasToPng(canvas)
    if (png.size > MAX_PAGE_BYTES) {
      throw new AnswerPdfPreparationError(
        'PAGE_TOO_LARGE',
        `Rendered page ${pageNumber} is larger than 3 MiB.`,
      )
    }

    totalBytes += png.size
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new AnswerPdfPreparationError(
        'TOTAL_TOO_LARGE',
        'Rendered answer pages are larger than 25 MiB in total.',
      )
    }

    const fileName = `page-${pageNumber}.png`
    pageFiles.push(new File([png], fileName, { type: 'image/png' }))
    pageManifest.push({ file_name: fileName, page_number: pageNumber, text })
    onProgress?.({ stage: 'rendering', current: index + 1, total: selectedPages.length })
  }

  const manifestBytes = new TextEncoder().encode(JSON.stringify(pageManifest)).byteLength
  if (totalBytes + manifestBytes + MULTIPART_OVERHEAD_BUDGET > MAX_TOTAL_BYTES) {
    throw new AnswerPdfPreparationError(
      'TOTAL_TOO_LARGE',
      'Rendered answer pages and metadata are larger than 25 MiB in total.',
    )
  }

  return {
    page_files: pageFiles,
    page_manifest: pageManifest,
    total_pages: pdf.numPages,
  }
}

function textItemsToTopLeftGeometry(viewport, content) {
  return content.items.flatMap((item, itemIndex) => {
    const text = item.str?.trim()
    if (!text) return []

    const height = Math.abs(item.height || item.transform?.[3] || 0)
    return [{
      text,
      x: item.transform[4],
      y: viewport.height - item.transform[5] - height,
      width: item.width,
      height,
      itemIndex,
    }]
  })
}

function questionForRegion(region, questionMarkers) {
  const regionCenterY = region.y + region.height / 2
  return questionMarkers
    .filter(marker => marker.y <= regionCenterY)
    .at(-1)?.qId ?? null
}

function optionForGreenRegion(region, optionLabels) {
  const regionCenterX = region.x + region.width / 2
  const regionCenterY = region.y + region.height / 2
  return optionLabels
    .flatMap((label) => {
      const labelCenterY = label.y + label.height / 2
      const verticalDistance = Math.abs(regionCenterY - labelCenterY)
      const rowTolerance = Math.max(region.height, label.height) * 1.5 + 2
      if (verticalDistance > rowTolerance || label.x > regionCenterX) return []
      const horizontalDistance = Math.max(0, region.x - (label.x + label.width))
      return [{ value: label.value, score: verticalDistance * 4 + horizontalDistance }]
    })
    .sort((left, right) => left.score - right.score)[0]?.value ?? null
}
