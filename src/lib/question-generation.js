import {
  QUESTION_DETECTOR_VERSION,
  detectQuestionRegions,
} from './question-detection'
import {
  detectGreenHighlightRegions,
  extractGreenAnswerSuggestions,
} from './answer-highlights'

const PAGE_RENDER_SCALE = 2
const MAX_RENDER_WIDTH = 1600
const WEBP_QUALITY = 0.9
const MAX_SEPARATOR_DISTANCE = 72
const MIN_SEPARATOR_HEIGHT = 3

let pdfjsPromise

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

export function textContentToPageGeometry(pageNumber, viewport, content) {
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    items: content.items.flatMap((item, itemIndex) => {
      const text = item.str?.trim()
      if (!text) return []

      const height = Math.abs(item.height || item.transform?.[3] || 0)
      return [{
        text,
        x: item.transform[4],
        top: viewport.height - item.transform[5] - height,
        width: item.width,
        height,
        itemIndex,
      }]
    }),
  }
}

export function getCropPixels(rect, canvas) {
  const x = Math.max(0, Math.floor(rect.x * canvas.width))
  const y = Math.max(0, Math.floor(rect.y * canvas.height))
  const right = Math.min(canvas.width, Math.ceil((rect.x + rect.width) * canvas.width))
  const bottom = Math.min(canvas.height, Math.ceil((rect.y + rect.height) * canvas.height))
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

export function getQuestionSegmentsToRender(detection, questionIdsToRender) {
  const selectedQuestionIds = questionIdsToRender ? new Set(questionIdsToRender) : null
  return detection.questions.flatMap(question => (
    selectedQuestionIds && !selectedQuestionIds.has(question.qId)
      ? []
      : question.segments.map(segment => ({ ...segment, qId: question.qId }))
  ))
}

export function processGreenHighlights({
  imageData,
  qId,
  sourcePage,
  sourceOffsetX,
  sourceOffsetY,
  pagePixelWidth,
  pagePixelHeight,
  schemaRows,
  textItems,
}) {
  const regions = detectGreenHighlightRegions(imageData)
  if (regions.length === 0) {
    return { imageData, answerCandidates: [], hasBlockingHighlight: false }
  }

  const extraction = extractGreenAnswerSuggestions({
    qId,
    sourcePage,
    schemaRows,
    regions,
    textItems,
  })
  if (extraction.unresolvedRegionIndexes.length > 0) {
    return { imageData, answerCandidates: [], hasBlockingHighlight: true }
  }

  const answerCandidates = extraction.suggestions.map((suggestion) => {
    const evidence = boundsForRegions(suggestion.regionIndexes.map(index => regions[index]))
    return {
      ...suggestion,
      sourceX: normalizedCoordinate(sourceOffsetX + evidence.x, pagePixelWidth),
      sourceY: normalizedCoordinate(sourceOffsetY + evidence.y, pagePixelHeight),
      sourceWidth: normalizedCoordinate(evidence.width, pagePixelWidth),
      sourceHeight: normalizedCoordinate(evidence.height, pagePixelHeight),
    }
  })

  return {
    imageData,
    answerCandidates,
    hasBlockingHighlight: false,
  }
}

export function findQuestionSeparator(rowInk, anchorRow, {
  minRow,
  maxDistance,
  minBlankRows,
  blankThreshold,
}) {
  const anchor = Math.min(rowInk.length, Math.max(0, Math.floor(anchorRow)))
  const lowerBound = Math.max(0, Math.floor(minRow), anchor - Math.ceil(maxDistance))
  let blankEnd = null

  for (let row = anchor - 1; row >= lowerBound; row -= 1) {
    if (rowInk[row] <= blankThreshold) {
      if (blankEnd === null) blankEnd = row
      continue
    }
    if (blankEnd !== null) {
      const blankStart = row + 1
      if (blankEnd - blankStart + 1 >= minBlankRows) {
        return Math.round((blankStart + blankEnd) / 2)
      }
      blankEnd = null
    }
  }

  if (blankEnd !== null && blankEnd - lowerBound + 1 >= minBlankRows) {
    return Math.round((lowerBound + blankEnd) / 2)
  }
  return null
}

export async function generateQuestionAssets(
  source,
  expectedQuestionIds,
  { onProgress, questionIdsToRender, schemaRows = [], createAssets = true } = {},
) {
  const pdfjs = await getPdfjs()
  const data = source instanceof Uint8Array
    ? source
    : new Uint8Array(source instanceof ArrayBuffer ? source : await source.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  const pdf = await loadingTask.promise

  try {
    const pages = []
    onProgress?.({ stage: 'reading', current: 0, total: pdf.numPages })

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      pages.push(textContentToPageGeometry(pageNumber, viewport, content))
      onProgress?.({ stage: 'reading', current: pageNumber, total: pdf.numPages })
      await yieldToMain()
    }

    onProgress?.({ stage: 'detecting', current: 0, total: 1 })
    const detection = detectQuestionRegions(pages, expectedQuestionIds)
    onProgress?.({ stage: 'detecting', current: 1, total: 1 })

    const segments = getQuestionSegmentsToRender(detection, questionIdsToRender)
    const byPage = Map.groupBy(segments, segment => segment.sourcePage)
    const assets = []
    const answerCandidates = []
    const warnings = [...detection.warnings]
    let renderedCount = 0
    onProgress?.({ stage: 'rendering', current: 0, total: segments.length })

    for (const [pageNumber, pageSegments] of byPage) {
      const page = await pdf.getPage(pageNumber)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(PAGE_RENDER_SCALE, MAX_RENDER_WIDTH / baseViewport.width)
      const viewport = page.getViewport({ scale })
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = Math.ceil(viewport.width)
      pageCanvas.height = Math.ceil(viewport.height)
      const pageContext = pageCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
      if (!pageContext) throw generationError('CANVAS_UNAVAILABLE', 'Could not create the PDF rendering canvas')

      await page.render({ canvasContext: pageContext, viewport }).promise
      const rowInk = getRowInkCounts(pageContext, pageCanvas, pageSegments[0])

      for (const segment of pageSegments) {
        const refinedSegment = refineVerticalBounds(segment, rowInk, pageCanvas, scale)
        const crop = getCropPixels(refinedSegment, pageCanvas)
        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = crop.width
        cropCanvas.height = crop.height
        const cropContext = cropCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
        if (!cropContext) throw generationError('CANVAS_UNAVAILABLE', 'Could not create the question crop canvas')
        cropContext.drawImage(
          pageCanvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height,
        )

        if (!createAssets) {
          const greenResult = processGreenHighlights({
            imageData: cropContext.getImageData(0, 0, crop.width, crop.height),
            qId: refinedSegment.qId,
            sourcePage: refinedSegment.sourcePage,
            sourceOffsetX: crop.x,
            sourceOffsetY: crop.y,
            pagePixelWidth: pageCanvas.width,
            pagePixelHeight: pageCanvas.height,
            schemaRows,
            textItems: cropTextItems(pages[pageNumber - 1], scale, crop),
          })
          answerCandidates.push(...greenResult.answerCandidates)
        }

        if (createAssets) {
          const blob = await canvasToWebp(cropCanvas)
          const {
            _topAnchorY,
            _topAnchorType,
            _topFloorY,
            _bottomAnchorY,
            _bottomAnchorType,
            ...assetSegment
          } = refinedSegment
          assets.push({
            ...assetSegment,
            accessibleText: getAccessibleText(assetSegment, pages[pageNumber - 1]),
            confidence: refinedSegment.confidence,
            blob,
            pixelWidth: crop.width,
            pixelHeight: crop.height,
            fileName: `question-${refinedSegment.qId}-${refinedSegment.segmentIndex + 1}.webp`,
          })
        }
        renderedCount += 1
        onProgress?.({ stage: 'rendering', current: renderedCount, total: segments.length })
      }
      page.cleanup()
      await yieldToMain()
    }

    return {
      detectorVersion: QUESTION_DETECTOR_VERSION,
      detectionMethod: detection.detectionMethod,
      pageCount: detection.pageCount,
      warnings,
      answerCandidates: deduplicateGreenCandidates(answerCandidates, assets, warnings),
      assets,
    }
  } finally {
    await pdf.destroy()
  }
}

function cropTextItems(page, scale, crop) {
  return page.items.map(item => ({
    text: item.text,
    x: item.x * scale - crop.x,
    y: item.top * scale - crop.y,
    width: item.width * scale,
    height: item.height * scale,
  }))
}

function boundsForRegions(regions) {
  const left = Math.min(...regions.map(region => region.x))
  const top = Math.min(...regions.map(region => region.y))
  const right = Math.max(...regions.map(region => region.x + region.width))
  const bottom = Math.max(...regions.map(region => region.y + region.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function normalizedCoordinate(value, total) {
  return Number((value / total).toFixed(6))
}

function deduplicateGreenCandidates(candidates, assets, warnings) {
  const byKey = Map.groupBy(candidates, candidate => `${candidate.qId}:${candidate.subId ?? ''}`)
  const result = []
  for (const [key, matches] of byKey) {
    const values = new Set(matches.map(match => match.proposedAnswer))
    if (values.size === 1) {
      result.push(matches[0])
      continue
    }

    const qId = matches[0].qId
    for (const asset of assets) {
      if (asset.qId === qId) {
        asset.confidence = Math.min(asset.confidence, 0.5)
      }
    }
    warnings.push({ code: 'CONFLICTING_ANSWER_HIGHLIGHTS', qId, key })
  }
  return result
}

function getRowInkCounts(context, canvas, segment) {
  const left = Math.max(0, Math.floor(segment.x * canvas.width))
  const right = Math.min(canvas.width, Math.ceil((segment.x + segment.width) * canvas.width))
  const image = context.getImageData(left, 0, right - left, canvas.height)
  const rowInk = new Uint32Array(canvas.height)

  for (let row = 0; row < image.height; row += 1) {
    const rowStart = row * image.width * 4
    const rowEnd = rowStart + image.width * 4
    let count = 0
    for (let index = rowStart; index < rowEnd; index += 4) {
      if (image.data[index] < 245 || image.data[index + 1] < 245 || image.data[index + 2] < 245) {
        count += 1
      }
    }
    rowInk[row] = count
  }
  return { counts: rowInk, scannedWidth: image.width }
}

function refineVerticalBounds(segment, rowInk, canvas, scale) {
  let top = segment.y
  let bottom = segment.y + segment.height
  const options = {
    maxDistance: MAX_SEPARATOR_DISTANCE * scale,
    minBlankRows: Math.max(2, Math.ceil(MIN_SEPARATOR_HEIGHT * scale)),
    blankThreshold: Math.max(2, Math.ceil(rowInk.scannedWidth * 0.001)),
  }

  if (segment._topAnchorY !== null && segment._topAnchorType !== 'section') {
    const separator = findQuestionSeparator(rowInk.counts, segment._topAnchorY * canvas.height, {
      ...options,
      minRow: segment._topFloorY * canvas.height,
    })
    if (separator !== null) top = separator / canvas.height
  }
  if (segment._bottomAnchorY !== null && segment._bottomAnchorType !== 'section') {
    const separator = findQuestionSeparator(rowInk.counts, segment._bottomAnchorY * canvas.height, {
      ...options,
      minRow: top * canvas.height,
    })
    if (separator !== null) bottom = separator / canvas.height
  }

  if (!(bottom > top)) return segment
  return {
    ...segment,
    y: Number(top.toFixed(6)),
    height: Number((bottom - top).toFixed(6)),
  }
}

function getAccessibleText(segment, page) {
  const top = segment.y * page.height
  const bottom = (segment.y + segment.height) * page.height
  const text = page.items
    .filter(item => item.top + item.height > top && item.top < bottom)
    .sort((a, b) => a.top - b.top || a.x - b.x || a.itemIndex - b.itemIndex)
    .map(item => item.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || segment.accessibleText || ''
}

function canvasToWebp(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/webp') {
        reject(generationError('WEBP_UNAVAILABLE', 'This browser could not create WebP question images'))
        return
      }
      resolve(blob)
    }, 'image/webp', WEBP_QUALITY)
  })
}

async function yieldToMain() {
  if (globalThis.scheduler?.yield) {
    await globalThis.scheduler.yield()
    return
  }
  await new Promise(resolve => setTimeout(resolve, 0))
}

function generationError(code, message) {
  return Object.assign(new Error(message), { code })
}
