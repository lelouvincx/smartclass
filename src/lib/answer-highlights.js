const MIN_HIGHLIGHT_PIXELS = 24
const HIGHLIGHT_AREA_RATIO = 0.0005

export function isSuspiciousHighlightGreen(red, green, blue, alpha) {
  return alpha >= 128
    && green >= 170
    && red <= 200
    && blue <= 200
    && green - red >= 35
    && green - blue >= 35
}

export function detectGreenHighlightRegions(imageData) {
  validateImageData(imageData)
  const { data, width, height } = imageData
  const pixelTotal = width * height
  const requiredPixels = Math.max(
    MIN_HIGHLIGHT_PIXELS,
    Math.ceil(pixelTotal * HIGHLIGHT_AREA_RATIO),
  )
  const visited = new Uint8Array(pixelTotal)
  const pending = new Uint32Array(pixelTotal)
  const regions = []

  for (let pixel = 0; pixel < pixelTotal; pixel += 1) {
    if (visited[pixel]) continue
    visited[pixel] = 1
    if (!isGreenPixel(data, pixel)) continue

    let head = 0
    let tail = 1
    let pixelCount = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    pending[0] = pixel

    while (head < tail) {
      const current = pending[head]
      head += 1
      const x = current % width
      const y = Math.floor(current / width)
      pixelCount += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      const top = Math.max(0, y - 1)
      const bottom = Math.min(height - 1, y + 1)
      const left = Math.max(0, x - 1)
      const right = Math.min(width - 1, x + 1)
      for (let neighborY = top; neighborY <= bottom; neighborY += 1) {
        for (let neighborX = left; neighborX <= right; neighborX += 1) {
          const neighbor = neighborY * width + neighborX
          if (visited[neighbor]) continue
          visited[neighbor] = 1
          if (!isGreenPixel(data, neighbor)) continue
          pending[tail] = neighbor
          tail += 1
        }
      }
    }

    if (pixelCount >= requiredPixels) {
      regions.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixelCount,
      })
    }
  }

  return regions
}

export function extractGreenAnswerSuggestions({
  qId,
  sourcePage,
  schemaRows,
  regions,
  textItems,
}) {
  if (!Number.isSafeInteger(qId) || qId <= 0 || !Number.isSafeInteger(sourcePage) || sourcePage <= 0) {
    throw new TypeError('Question and source page IDs must be positive integers')
  }
  if (!Array.isArray(schemaRows) || !Array.isArray(regions) || !Array.isArray(textItems)) {
    throw new TypeError('Schema rows, highlight regions, and text items must be arrays')
  }

  const questionRows = schemaRows.filter(row => Number(row.q_id) === qId)
  const type = questionRows[0]?.type
  if (!type || questionRows.some(row => row.type !== type)) {
    return unresolved(regions)
  }

  const candidates = regions.map((region, regionIndex) => {
    if (type === 'mcq') {
      const proposedAnswer = optionForRegion(region, textItems)
      return proposedAnswer
        ? suggestion(qId, null, type, proposedAnswer, sourcePage, regionIndex)
        : null
    }
    if (type === 'numeric') {
      const proposedAnswer = numericValueForRegion(region, textItems)
      return proposedAnswer !== null
        ? suggestion(qId, null, type, proposedAnswer, sourcePage, regionIndex)
        : null
    }
    if (type === 'boolean') {
      const subId = subIdForRegion(region, textItems, questionRows)
      const proposedAnswer = booleanValueForRegion(region, textItems)
      return subId && proposedAnswer !== null
        ? suggestion(qId, subId, type, proposedAnswer, sourcePage, regionIndex)
        : null
    }
    return null
  })

  if (candidates.some(candidate => candidate === null)) return unresolved(regions)

  const grouped = new Map()
  for (const candidate of candidates) {
    const key = `${candidate.qId}:${candidate.subId ?? ''}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(candidate)
  }

  const suggestions = []
  for (const matches of grouped.values()) {
    const values = new Set(matches.map(match => match.proposedAnswer))
    if (values.size !== 1) return unresolved(regions)
    suggestions.push({
      ...matches[0],
      regionIndexes: matches.map(match => match.regionIndexes[0]),
    })
  }

  const matchedRegionIndexes = suggestions.flatMap(item => item.regionIndexes).sort((a, b) => a - b)
  return { suggestions, matchedRegionIndexes, unresolvedRegionIndexes: [] }
}

export function sanitizeGreenHighlights(imageData, regions) {
  validateImageData(imageData)
  validateRegions(regions, imageData.width, imageData.height)
  const result = {
    data: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height,
  }

  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const pixel = y * result.width + x
        if (!isGreenPixel(result.data, pixel)) continue
        const index = pixel * 4
        result.data[index] = 255
        result.data[index + 1] = 255
        result.data[index + 2] = 255
        result.data[index + 3] = 255
      }
    }
  }

  return result
}

function optionForRegion(region, textItems) {
  const labels = textItems.flatMap((item) => {
    const match = item.text?.match(/^\s*([A-D])\s*[.)]/i)
    return match ? [{ ...item, value: match[1].toUpperCase() }] : []
  })
  return nearestRowLabel(region, labels)?.value ?? null
}

function subIdForRegion(region, textItems, schemaRows) {
  const allowed = new Set(schemaRows.map(row => row.sub_id).filter(Boolean))
  const labels = textItems.flatMap((item) => {
    const match = item.text?.match(/^\s*([a-d])\s*[).:-]/i)
    const value = match?.[1]?.toLowerCase()
    return value && allowed.has(value) ? [{ ...item, value }] : []
  })
  return nearestRowLabel(region, labels)?.value ?? null
}

function nearestRowLabel(region, labels) {
  const regionCenterX = region.x + region.width / 2
  const regionCenterY = region.y + region.height / 2
  return labels
    .flatMap((label) => {
      const labelCenterY = label.y + label.height / 2
      const verticalDistance = Math.abs(regionCenterY - labelCenterY)
      const rowTolerance = Math.max(region.height, label.height) * 1.5 + 2
      if (verticalDistance > rowTolerance || label.x > regionCenterX) return []
      const horizontalDistance = Math.max(0, region.x - (label.x + label.width))
      return [{ label, score: verticalDistance * 4 + horizontalDistance }]
    })
    .sort((left, right) => left.score - right.score)[0]?.label ?? null
}

function booleanValueForRegion(region, textItems) {
  const values = overlappingText(region, textItems).flatMap((text) => {
    const normalized = text
      .normalize('NFC')
      .toLocaleLowerCase('vi')
      .replace(/^[\s:;,.()\[\]-]+|[\s:;,.()\[\]-]+$/g, '')
    if (['đúng', 'true', 't', '1'].includes(normalized)) return ['1']
    if (['sai', 'false', 'f', '0'].includes(normalized)) return ['0']
    return []
  })
  return new Set(values).size === 1 ? values[0] : null
}

function numericValueForRegion(region, textItems) {
  const text = overlappingText(region, textItems).join(' ').replace(/−/g, '-')
  const numbers = text.match(/[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)/g) || []
  if (numbers.length !== 1) return null
  const value = Number(numbers[0].replace(',', '.'))
  return Number.isFinite(value) ? String(value) : null
}

function overlappingText(region, textItems) {
  return textItems
    .filter(item => rectanglesOverlap(region, item))
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map(item => item.text?.trim())
    .filter(Boolean)
}

function rectanglesOverlap(left, right) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function suggestion(qId, subId, type, proposedAnswer, sourcePage, regionIndex) {
  return {
    qId,
    subId,
    type,
    proposedAnswer,
    sourcePage,
    confidence: 1,
    regionIndexes: [regionIndex],
  }
}

function unresolved(regions) {
  return {
    suggestions: [],
    matchedRegionIndexes: [],
    unresolvedRegionIndexes: regions.map((_, index) => index),
  }
}

function isGreenPixel(data, pixel) {
  const index = pixel * 4
  return isSuspiciousHighlightGreen(
    data[index],
    data[index + 1],
    data[index + 2],
    data[index + 3],
  )
}

function validateImageData(imageData) {
  if (!imageData || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height)
    || imageData.width <= 0 || imageData.height <= 0) {
    throw new TypeError('Image data width and height must be positive integers')
  }
  if (!(imageData.data instanceof Uint8ClampedArray)) {
    throw new TypeError('Image data must be a Uint8ClampedArray')
  }
  if (imageData.data.length !== imageData.width * imageData.height * 4) {
    throw new RangeError('Image data length must equal width * height * 4')
  }
}

function validateRegions(regions, imageWidth, imageHeight) {
  if (!Array.isArray(regions) || regions.some(region => (
    !region
    || !Number.isInteger(region.x)
    || !Number.isInteger(region.y)
    || !Number.isInteger(region.width)
    || !Number.isInteger(region.height)
    || region.x < 0
    || region.y < 0
    || region.width <= 0
    || region.height <= 0
    || region.x + region.width > imageWidth
    || region.y + region.height > imageHeight
  ))) {
    throw new RangeError('Highlight regions must contain bounded integer rectangles')
  }
}
