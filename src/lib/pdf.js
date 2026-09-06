let pdfjsPromise

const PDF_DPI = 150
const PDF_POINTS_PER_INCH = 72
const MAX_SELECTED_PAGES = 10
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const MAX_TOTAL_BYTES = 25 * 1024 * 1024
const MULTIPART_OVERHEAD_BUDGET = 64 * 1024

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
