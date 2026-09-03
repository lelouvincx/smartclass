import { describe, expect, it } from 'vitest'
import {
  QUESTION_DETECTOR_VERSION,
  QuestionDetectionError,
  detectQuestionRegions,
} from './question-detection'

const item = (text, top, itemIndex, x = 10, width = 180, height = 10) => ({ text, x, top, width, height, itemIndex })
const page = (pageNumber, items, width = 200, height = 300) => ({ pageNumber, width, height, items })
const code = expected => expect.objectContaining({ code: expected })

describe('detectQuestionRegions', () => {
  it('detects Vietnamese and English markers and preserves deduplicated schema order', () => {
    const result = detectQuestionRegions([
      page(1, [item('question 2.) English', 20, 0), item('Body', 40, 1), item('CÂU 1: Tiếng Việt', 100, 2)]),
    ], [1, 2, 1])

    expect(result).toMatchObject({ detectorVersion: QUESTION_DETECTOR_VERSION, detectionMethod: 'text', pageCount: 1, warnings: [] })
    expect(result.questions.map(question => question.qId)).toEqual([1, 2])
    expect(result.questions[0].segments[0]).toMatchObject({ segmentIndex: 0, sourcePage: 1, confidence: 0.8 })
  })

  it.each(['Lời giải:', 'ĐÁP ÁN.', 'Đáp số)', 'Solution:', 'ANSWER.'])('ends before the inline %s boundary', marker => {
    const result = detectQuestionRegions([
      page(1, [item('Câu 1. Prompt', 20, 0), item('Question content', 40, 1), item(marker, 80, 2), item('secret', 100, 3)]),
    ], [1])
    const segment = result.questions[0].segments[0]
    expect(segment.y).toBe(0)
    expect(segment.height).toBeCloseTo(70 / 300)
    expect(segment.accessibleText).toBe('Câu 1. Prompt Question content')
  })

  it('assigns a structural heading to the following question', () => {
    const result = detectQuestionRegions([
      page(1, [item('Câu 1', 20, 0), item('Body one', 40, 1), item('PHẦN II: Algebra', 90, 2), item('Question 2', 110, 3), item('Body two', 130, 4)]),
    ], [1, 2])
    const [first, second] = result.questions
    expect(first.segments[0].height).toBeCloseTo(90 / 300)
    expect(first.segments[0].accessibleText).not.toContain('PHẦN')
    expect(second.segments[0].y).toBeCloseTo(90 / 300)
    expect(second.segments[0].accessibleText).toContain('PHẦN II: Algebra')
  })

  it('keeps current-row glyphs above the marker and excludes next-question glyphs', () => {
    const result = detectQuestionRegions([
      page(1, [
        item('Current formula', 12, 0),
        item('Câu 1', 20, 1),
        item('Body one', 40, 2),
        item('Next formula', 82, 3),
        item('Câu 2', 90, 4),
        item('Body two', 110, 5),
      ]),
    ], [1, 2])

    const segment = result.questions[0].segments[0]
    expect(segment.y).toBe(0)
    expect(segment.height).toBeCloseTo(65 / 300)
    expect(segment.accessibleText).toBe('Current formula Câu 1 Body one')
    expect(segment.accessibleText).not.toContain('Next formula')
    expect(segment._topAnchorY).toBeCloseTo(20 / 300)
    expect(segment._topFloorY).toBe(0)
    expect(segment._bottomAnchorY).toBeCloseTo(90 / 300)
  })

  it('does not extend a question crop above a preceding solution marker', () => {
    const result = detectQuestionRegions([
      page(1, [
        item('Câu 1', 20, 0),
        item('Lời giải', 50, 1),
        item('Câu 2', 70, 2),
        item('Body two', 90, 3),
      ]),
    ], [1, 2])

    const second = result.questions[1].segments[0]
    expect(second.y).toBeCloseTo(60 / 300)
    expect(second.accessibleText).toBe('Câu 2 Body two')
    expect(second._topFloorY).toBeCloseTo(60 / 300)
  })

  it('emits ordered multi-page normalized segments with contiguous indexes', () => {
    const result = detectQuestionRegions([
      page(1, [item('Câu 1', 200, 0), item('First half', 230, 1)]),
      page(2, [item('Second half', 20, 0), item('Question 2:', 100, 1), item('Next', 120, 2)]),
    ], [1, 2])
    expect(result.questions[0].segments.map(({ segmentIndex, sourcePage }) => [segmentIndex, sourcePage])).toEqual([[0, 1], [1, 2]])
    expect(result.questions[0].segments[1]).toMatchObject({ x: 0.05, y: 0, width: 0.9, height: 0.25 })
  })

  it.each([
    ['MISSING_QUESTION_MARKER', [page(1, [item('Câu 1', 20, 0)])], [1, 2]],
    ['DUPLICATE_QUESTION_MARKER', [page(1, [item('Câu 1', 20, 0), item('Question 1', 80, 1)])], [1]],
    ['UNEXPECTED_QUESTION_MARKER', [page(1, [item('Câu 1', 20, 0), item('Câu 9', 80, 1)])], [1]],
  ])('blocks structural marker failure %s', (errorCode, pages, ids) => {
    expect(() => detectQuestionRegions(pages, ids)).toThrow(code(errorCode))
  })

  it('rejects invalid page and item geometry', () => {
    expect(() => detectQuestionRegions([page(1, [item('Câu 1', 295, 0)])], [1])).toThrow(code('INVALID_PAGE_GEOMETRY'))
    expect(() => detectQuestionRegions([page(2, [item('Câu 1', 20, 0)])], [1])).toThrow(QuestionDetectionError)
  })

  it('rejects scanned or image-only pages', () => {
    expect(() => detectQuestionRegions([page(1, [])], [1])).toThrow(code('SCANNED_OR_IMAGE_ONLY_PAGE'))
  })

  it('skips empty leading whitespace before the next question on a new page', () => {
    const result = detectQuestionRegions([
      page(1, [item('Câu 1', 200, 0), item('Prompt', 230, 1)]),
      page(2, [item('Question 2', 100, 0), item('Next', 120, 1)]),
    ], [1, 2])

    expect(result.questions[0].segments).toHaveLength(1)
    expect(result.questions[1].segments).toHaveLength(1)
  })

  it('retains a possible diagram-only continuation without blocking on extracted text', () => {
    const result = detectQuestionRegions([
      page(1, [item('Câu 1', 200, 0), item('Prompt', 230, 1)]),
      page(2, [item('Lời giải', 100, 0), item('Secret', 120, 1)]),
    ], [1])

    expect(result.questions[0].segments).toHaveLength(2)
    expect(result.questions[0].segments[1]).toMatchObject({
      segmentIndex: 1,
      sourcePage: 2,
      accessibleText: '',
      confidence: 0.8,
    })
    expect(result.warnings).toEqual([])
  })

  it('clamps horizontal margins safely on small pages', () => {
    const result = detectQuestionRegions([page(1, [item('Câu 1', 10, 0, 1, 8, 2)], 10, 20)], [1])
    expect(result.questions[0].segments[0]).toMatchObject({ x: 0.05, width: 0.9 })
  })

  it('rejects invalid expected IDs', () => {
    expect(() => detectQuestionRegions([page(1, [item('Câu 1', 20, 0)])], [0])).toThrow(code('INVALID_EXPECTED_QUESTION_IDS'))
  })
})
