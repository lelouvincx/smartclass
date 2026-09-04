import { describe, expect, it } from 'vitest'
import {
  detectGreenHighlightRegions,
  extractGreenAnswerSuggestions,
  isSuspiciousHighlightGreen,
} from './answer-highlights'

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

describe('detectGreenHighlightRegions', () => {
  it('finds a material connected region with its pixel bounds and ignores sparse noise', () => {
    const source = image(100, 100)
    fillRect(source, 12, 20, 8, 4, [0, 255, 0, 255])
    for (let index = 0; index < 30; index += 1) {
      const x = 40 + (index % 10) * 3
      const y = 5 + Math.floor(index / 10) * 3
      source.data.set([0, 255, 0, 255], (y * source.width + x) * 4)
    }

    expect(detectGreenHighlightRegions(source)).toEqual([
      { x: 12, y: 20, width: 8, height: 4, pixelCount: 32 },
    ])
  })

  it('treats supported antialiased green edges as part of the component', () => {
    const source = image(80, 80)
    fillRect(source, 10, 10, 6, 4, [20, 210, 40, 255])
    fillRect(source, 9, 10, 1, 4, [170, 225, 175, 255])

    expect(isSuspiciousHighlightGreen(170, 225, 175, 255)).toBe(true)
    expect(detectGreenHighlightRegions(source)).toEqual([
      { x: 9, y: 10, width: 7, height: 4, pixelCount: 28 },
    ])
  })
})

describe('extractGreenAnswerSuggestions', () => {
  it('maps one highlighted multiple-choice row to its option', () => {
    const result = extractGreenAnswerSuggestions({
      qId: 4,
      sourcePage: 2,
      schemaRows: [{ q_id: 4, sub_id: null, type: 'mcq', correct_answer: 'A' }],
      regions: [{ x: 96, y: 42, width: 60, height: 14, pixelCount: 600 }],
      textItems: [
        { text: 'A.', x: 10, y: 10, width: 12, height: 10 },
        { text: 'B.', x: 80, y: 42, width: 12, height: 10 },
        { text: 'C.', x: 10, y: 72, width: 12, height: 10 },
      ],
    })

    expect(result).toEqual({
      suggestions: [{
        qId: 4,
        subId: null,
        type: 'mcq',
        proposedAnswer: 'B',
        sourcePage: 2,
        confidence: 1,
        regionIndexes: [0],
      }],
      matchedRegionIndexes: [0],
      unresolvedRegionIndexes: [],
    })
  })

  it('extracts schema-valid boolean and numeric values from highlighted text', () => {
    expect(extractGreenAnswerSuggestions({
      qId: 18,
      sourcePage: 5,
      schemaRows: [
        { q_id: 18, sub_id: 'a', type: 'boolean' },
        { q_id: 18, sub_id: 'b', type: 'boolean' },
      ],
      regions: [
        { x: 70, y: 10, width: 30, height: 12, pixelCount: 200 },
        { x: 70, y: 40, width: 30, height: 12, pixelCount: 200 },
      ],
      textItems: [
        { text: 'a)', x: 10, y: 10, width: 10, height: 10 },
        { text: 'Đúng', x: 70, y: 10, width: 25, height: 10 },
        { text: 'b)', x: 10, y: 40, width: 10, height: 10 },
        { text: 'Sai', x: 70, y: 40, width: 20, height: 10 },
      ],
    }).suggestions).toEqual([
      expect.objectContaining({ qId: 18, subId: 'a', type: 'boolean', proposedAnswer: '1' }),
      expect.objectContaining({ qId: 18, subId: 'b', type: 'boolean', proposedAnswer: '0' }),
    ])

    expect(extractGreenAnswerSuggestions({
      qId: 22,
      sourcePage: 7,
      schemaRows: [{ q_id: 22, sub_id: null, type: 'numeric' }],
      regions: [{ x: 80, y: 20, width: 35, height: 12, pixelCount: 220 }],
      textItems: [{ text: '-3,5', x: 82, y: 20, width: 30, height: 10 }],
    }).suggestions).toEqual([
      expect.objectContaining({ qId: 22, subId: null, type: 'numeric', proposedAnswer: '-3.5' }),
    ])
  })

  it('abstains when highlights are ambiguous or cannot be mapped to the schema', () => {
    const result = extractGreenAnswerSuggestions({
      qId: 1,
      sourcePage: 1,
      schemaRows: [{ q_id: 1, sub_id: null, type: 'mcq' }],
      regions: [
        { x: 30, y: 10, width: 30, height: 12, pixelCount: 200 },
        { x: 30, y: 40, width: 30, height: 12, pixelCount: 200 },
        { x: 150, y: 90, width: 20, height: 20, pixelCount: 250 },
      ],
      textItems: [
        { text: 'A.', x: 10, y: 10, width: 12, height: 10 },
        { text: 'B.', x: 10, y: 40, width: 12, height: 10 },
      ],
    })

    expect(result.suggestions).toEqual([])
    expect(result.matchedRegionIndexes).toEqual([])
    expect(result.unresolvedRegionIndexes).toEqual([0, 1, 2])
  })
})

describe('image validation', () => {
  it('fails clearly for malformed dimensions or pixel buffers', () => {
    expect(() => detectGreenHighlightRegions({
      data: new Uint8ClampedArray(16),
      width: 1.5,
      height: 2,
    })).toThrow('width and height must be positive integers')
    expect(() => detectGreenHighlightRegions({
      data: new Uint8ClampedArray(15),
      width: 2,
      height: 2,
    })).toThrow('data length must equal width * height * 4')
  })
})
