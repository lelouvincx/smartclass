import { describe, expect, it } from 'vitest'
import {
  findQuestionSeparator,
  getCropPixels,
  getQuestionSegmentsToRender,
  hasSuspiciousGreenHighlight,
  processGreenHighlights,
  textContentToPageGeometry,
} from './question-generation'

function image(width, height, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) data.set(color, index)
  return { data, width, height }
}

function fillRect(source, x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      source.data.set(color, (row * source.width + column) * 4)
    }
  }
}

describe('textContentToPageGeometry', () => {
  it('converts PDF bottom-left text coordinates to top-left page geometry', () => {
    const result = textContentToPageGeometry(2, { width: 600, height: 800 }, {
      items: [
        {
          str: '  Câu 4. Nội dung  ',
          transform: [1, 0, 0, 12, 48, 700],
          width: 180,
          height: 12,
        },
        { str: '   ', transform: [1, 0, 0, 10, 20, 20], width: 10, height: 10 },
      ],
    })

    expect(result).toEqual({
      pageNumber: 2,
      width: 600,
      height: 800,
      items: [{
        text: 'Câu 4. Nội dung',
        x: 48,
        top: 88,
        width: 180,
        height: 12,
        itemIndex: 0,
      }],
    })
  })
})

describe('getCropPixels', () => {
  it('converts normalized geometry to bounded integer canvas pixels', () => {
    expect(getCropPixels(
      { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
      { width: 1200, height: 1600 },
    )).toEqual({ x: 120, y: 320, width: 600, height: 400 })
  })

  it('keeps a rounded crop inside the source canvas', () => {
    expect(getCropPixels(
      { x: 0.999, y: 0.999, width: 0.001, height: 0.001 },
      { width: 101, height: 101 },
    )).toEqual({ x: 100, y: 100, width: 1, height: 1 })
  })
})

describe('getQuestionSegmentsToRender', () => {
  it('keeps detection over the complete set while selecting one question to render', () => {
    const detection = {
      questions: [
        { qId: 1, segments: [{ sourcePage: 1, segmentIndex: 0 }] },
        {
          qId: 2,
          segments: [
            { sourcePage: 2, segmentIndex: 0 },
            { sourcePage: 3, segmentIndex: 1 },
          ],
        },
      ],
    }

    expect(getQuestionSegmentsToRender(detection, [2])).toEqual([
      { qId: 2, sourcePage: 2, segmentIndex: 0 },
      { qId: 2, sourcePage: 3, segmentIndex: 1 },
    ])
    expect(getQuestionSegmentsToRender(detection)).toHaveLength(3)
  })
})

describe('hasSuspiciousGreenHighlight', () => {
  it('flags a material bright-green region but ignores isolated green pixels', () => {
    const highlighted = new Uint8ClampedArray(100 * 100 * 4)
    for (let pixel = 0; pixel < 30; pixel += 1) {
      highlighted.set([0, 255, 0, 255], pixel * 4)
    }
    const isolated = new Uint8ClampedArray(highlighted)
    isolated.fill(0, 4 * 4)

    expect(hasSuspiciousGreenHighlight({ data: highlighted, width: 100, height: 100 })).toBe(true)
    expect(hasSuspiciousGreenHighlight({ data: isolated, width: 100, height: 100 })).toBe(false)
  })
})

describe('processGreenHighlights', () => {
  it('extracts a schema-aware candidate and removes its green background from the student crop', () => {
    const source = image(100, 40)
    fillRect(source, 30, 10, 45, 12, [0, 220, 30, 255])
    fillRect(source, 34, 13, 4, 6, [0, 0, 0, 255])

    const result = processGreenHighlights({
      imageData: source,
      qId: 4,
      sourcePage: 2,
      sourceOffsetX: 100,
      sourceOffsetY: 200,
      pagePixelWidth: 1000,
      pagePixelHeight: 1200,
      schemaRows: [{ q_id: 4, sub_id: null, type: 'mcq', correct_answer: 'A' }],
      textItems: [{ text: 'B.', x: 28, y: 10, width: 12, height: 10 }],
    })

    expect(result.hasBlockingHighlight).toBe(false)
    expect(result.answerCandidates).toEqual([
      expect.objectContaining({
        qId: 4,
        subId: null,
        type: 'mcq',
        proposedAnswer: 'B',
        sourcePage: 2,
        sourceX: 0.13,
      }),
    ])
    expect(Array.from(result.imageData.data.slice((10 * 100 + 30) * 4, (10 * 100 + 30) * 4 + 4)))
      .toEqual([255, 255, 255, 255])
    expect(Array.from(result.imageData.data.slice((13 * 100 + 34) * 4, (13 * 100 + 34) * 4 + 4)))
      .toEqual([0, 0, 0, 255])
  })

  it('keeps an unresolvable green region blocking and does not alter its pixels', () => {
    const source = image(100, 40)
    fillRect(source, 30, 10, 45, 12, [0, 220, 30, 255])

    const result = processGreenHighlights({
      imageData: source,
      qId: 4,
      sourcePage: 2,
      sourceOffsetX: 0,
      sourceOffsetY: 0,
      pagePixelWidth: 100,
      pagePixelHeight: 40,
      schemaRows: [{ q_id: 4, sub_id: null, type: 'mcq', correct_answer: 'A' }],
      textItems: [],
    })

    expect(result.hasBlockingHighlight).toBe(true)
    expect(result.answerCandidates).toEqual([])
    expect(Array.from(result.imageData.data.slice((10 * 100 + 30) * 4, (10 * 100 + 30) * 4 + 4)))
      .toEqual([0, 220, 30, 255])
  })
})

describe('findQuestionSeparator', () => {
  it('chooses the nearest meaningful blank band before an anchor', () => {
    const rowInk = [5, 5, 0, 0, 0, 0, 5, 0, 0, 5, 5, 5]

    expect(findQuestionSeparator(rowInk, 11, {
      minRow: 0,
      maxDistance: 10,
      minBlankRows: 3,
      blankThreshold: 0,
    })).toBe(4)
  })

  it('ignores short internal gaps and respects the safe lower bound', () => {
    const rowInk = [0, 0, 0, 0, 5, 0, 0, 5, 5, 5, 5, 5]

    expect(findQuestionSeparator(rowInk, 11, {
      minRow: 4,
      maxDistance: 10,
      minBlankRows: 3,
      blankThreshold: 0,
    })).toBeNull()
  })
})
