import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAnswerPdfBlockPages, parseAnswerPdfPages, parseStudentPhotoAnswers } from './cohere-table-parser.js'

const fixturePath = name => resolve('worker/lib/fixtures', name)

const PINNED_SCHEMA = [
  ...[1, 2, 3, 4].map(q_id => ({ q_id, local_number: q_id, type: 'mcq', sub_id: null })),
  ...['a', 'b', 'c', 'd'].map(sub_id => ({ q_id: 5, local_number: 5, type: 'boolean', sub_id })),
  { q_id: 6, local_number: 6, type: 'numeric', sub_id: null },
  { q_id: 7, local_number: 7, type: 'numeric', sub_id: null },
]

async function textFixture(name) {
  return readFile(fixturePath(name), 'utf8')
}

describe('Answer PDF Cohere table adapter', () => {
  it('adapts experimental Cohere table blocks by feeding only table HTML into the answer parser', () => {
    const result = parseAnswerPdfBlockPages([{
      page_number: 1,
      text: 'PHẦN I. FIRST',
      blocks: [
        { type: 'text', text: { content: '<table><tr><td>99.D</td></tr></table>' } },
        { type: 'image', image: { description: '<table><tr><td>98.C</td></tr></table>' } },
        { type: 'table', table: { type: 'html', html: '<table><tr><td>1.A</td><td>2.B</td></tr></table>' } },
      ],
    }])

    expect(result.warnings).toEqual([])
    expect(result.schema.map(row => [row.local_number, row.correct_answer])).toEqual([
      [1, 'A'],
      [2, 'B'],
    ])
  })

  it('warns when experimental Cohere blocks contain no table HTML', () => {
    const result = parseAnswerPdfBlockPages([{
      page_number: 2,
      text: 'PHẦN II. SECOND',
      blocks: [{ type: 'text', text: { content: '<table><tr><td>1.A</td></tr></table>' } }],
    }])

    expect(result.schema).toEqual([])
    expect(result.warnings).toEqual(['Page 2 has no supported answer table.'])
  })

  it('extracts all 34 POC answer cells in section and document order', async () => {
    const pages = JSON.parse(await textFixture('cohere-answer-pages.json'))

    const result = parseAnswerPdfPages(pages)

    expect(result.warnings).toEqual([])
    expect(result.schema).toHaveLength(34)
    expect(result.schema.map(row => row.correct_answer)).toEqual([
      'B', 'B', 'B', 'D', 'D', 'C', 'D', 'D', 'A', 'D', 'C', 'A',
      '0', '0', '0', '1',
      '0', '1', '1', '1',
      '0', '0', '1', '1',
      '0', '0', '1', '1',
      '26.6', '84', '2', '14', '-0.3', '-1.8',
    ])
    expect(result.schema[0]).toEqual({
      q_id: 1,
      section_key: 'section-1',
      section_title: 'PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN',
      local_number: 1,
      type: 'mcq',
      sub_id: null,
      correct_answer: 'B',
      confidence: null,
    })
    expect(result.schema[12]).toMatchObject({
      q_id: 13,
      section_key: 'section-2',
      local_number: 1,
      type: 'boolean',
      sub_id: 'a',
    })
    expect(result.schema[28]).toMatchObject({
      q_id: 17,
      section_key: 'section-3',
      local_number: 1,
      type: 'numeric',
    })
    expect(result.schema.every(row => row.confidence === null)).toBe(true)
  })

  it('keeps repeated local numbering distinct across source sections', () => {
    const result = parseAnswerPdfPages([
      { page_number: 1, text: 'PHẦN I. FIRST', markdown: '<table><tr><td>1.A</td></tr></table>' },
      { page_number: 2, text: 'PHẦN II. SECOND', markdown: '<table><tr><td>1.B</td></tr></table>' },
    ])

    expect(result.schema.map(row => [row.q_id, row.section_key, row.local_number])).toEqual([
      [1, 'section-1', 1],
      [2, 'section-2', 1],
    ])
  })

  it('finds embedded section headings and keeps only the exact source title', () => {
    const result = parseAnswerPdfPages([
      {
        page_number: 1,
        text: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO GIA BÌNH PHẦN I. CÂU TRẮC NGHIỆM BẢNG ĐÁP ÁN Câu 1',
        markdown: '<table><tr><td>1.A</td></tr></table>',
      },
      {
        page_number: 2,
        text: 'Lời hướng dẫn PHẦN II. CÂU ĐÚNG SAI ĐÁP ÁN Câu 1',
        markdown: '<table><tr><td>1.B</td></tr></table>',
      },
    ])

    expect(result.schema.map(row => [
      row.q_id,
      row.section_key,
      row.section_title,
      row.local_number,
    ])).toEqual([
      [1, 'section-1', 'PHẦN I. CÂU TRẮC NGHIỆM', 1],
      [2, 'section-2', 'PHẦN II. CÂU ĐÚNG SAI', 1],
    ])
  })

  it('preserves distinct section identity when a safe exact title is unavailable', () => {
    const result = parseAnswerPdfPages([
      { page_number: 1, text: 'PHAN I', markdown: '<table><tr><td>1.A</td></tr></table>' },
      { page_number: 2, text: 'PHAN II', markdown: '<table><tr><td>1.B</td></tr></table>' },
    ])

    expect(result.schema.map(row => [row.section_key, row.section_title, row.local_number])).toEqual([
      ['section-1', null, 1],
      ['section-2', null, 1],
    ])
  })

  it('rejects duplicate or conflicting identities while retaining other valid pages', () => {
    const result = parseAnswerPdfPages([
      { page_number: 1, text: 'PHẦN I. FIRST', markdown: '<table><tr><td>1.A</td><td>2.B</td><td>3.C</td></tr></table>' },
      { page_number: 2, text: '', markdown: '<table><tr><td>2.D</td></tr></table>' },
    ])

    expect(result.schema).toEqual([
      expect.objectContaining({ q_id: 1, local_number: 1, correct_answer: 'A' }),
      expect.objectContaining({ q_id: 2, local_number: 2, correct_answer: '' }),
      expect.objectContaining({ q_id: 3, local_number: 3, correct_answer: 'C' }),
    ])
    expect(result.warnings).toHaveLength(1)
  })

  it('maps parsed answers onto an existing unsectioned schema without changing identity', () => {
    const schemaShape = [
      { q_id: 7, section_key: 'main', section_title: null, local_number: 1, type: 'mcq', sub_id: null },
      { q_id: 8, section_key: 'main', section_title: null, local_number: 2, type: 'mcq', sub_id: null },
      { q_id: 9, section_key: 'main', section_title: null, local_number: 3, type: 'mcq', sub_id: null },
    ]
    const result = parseAnswerPdfPages([{
      page_number: 1,
      text: 'BẢNG ĐÁP ÁN',
      markdown: '<table><tr><td>1.A</td><td>3.C</td></tr></table>',
    }], { schemaShape })

    expect(result.schema).toEqual([
      { ...schemaShape[0], correct_answer: 'A', confidence: null },
      { ...schemaShape[1], correct_answer: '', confidence: null },
      { ...schemaShape[2], correct_answer: 'C', confidence: null },
    ])
  })

  it('does not shift a later named section onto an earlier missing section', () => {
    const schemaShape = [
      { q_id: 1, section_key: 'part-one', section_title: 'PHẦN I. MULTIPLE CHOICE', local_number: 1, type: 'mcq', sub_id: null },
      { q_id: 2, section_key: 'part-two', section_title: 'PHẦN II. TRUE FALSE', local_number: 1, type: 'mcq', sub_id: null },
    ]
    const result = parseAnswerPdfPages([{
      page_number: 2,
      text: 'PHẦN II. TRUE FALSE BẢNG ĐÁP ÁN',
      markdown: '<table><tr><td>1.B</td></tr></table>',
    }], { schemaShape })

    expect(result.schema.map(row => row.correct_answer)).toEqual(['', 'B'])
  })

  it('associates ordered tables with multiple sections on one page', () => {
    const result = parseAnswerPdfPages([{
      page_number: 1,
      text: 'PHẦN I. MULTIPLE CHOICE BẢNG ĐÁP ÁN 1 PHẦN II. TRUE FALSE BẢNG ĐÁP ÁN 1',
      markdown: [
        '<table><tr><td>1.A</td></tr></table>',
        '<table><tr><td>1.B</td></tr></table>',
      ].join('\n'),
    }])

    expect(result.schema.map(row => [row.q_id, row.section_key, row.local_number, row.correct_answer])).toEqual([
      [1, 'section-1', 1, 'A'],
      [2, 'section-2', 1, 'B'],
    ])
    expect(result.warnings).toEqual([])
  })

  it('warns on malformed or ambiguous tables and count mismatches without inventing rows', () => {
    const result = parseAnswerPdfPages([{
      page_number: 4,
      text: 'PHẦN I. FIRST',
      markdown: 'prose <table><tr><td>maybe A or B</td></tr></table>',
    }], { expectedQuestionCount: 3 })

    expect(result.schema).toEqual([])
    expect(result.warnings).toHaveLength(2)
  })
})

describe('student-photo Cohere table adapter', () => {
  it('maps the clean fixture to all 10 pinned rows without invented confidence', async () => {
    const result = parseStudentPhotoAnswers(await textFixture('cohere-student-clean.md'), PINNED_SCHEMA)

    expect(result.warnings).toEqual([])
    expect(result.answers).toEqual([
      { q_id: 1, sub_id: null, answer: 'B', confidence: null },
      { q_id: 2, sub_id: null, answer: 'D', confidence: null },
      { q_id: 3, sub_id: null, answer: 'A', confidence: null },
      { q_id: 4, sub_id: null, answer: 'C', confidence: null },
      { q_id: 5, sub_id: 'a', answer: '1', confidence: null },
      { q_id: 5, sub_id: 'b', answer: '0', confidence: null },
      { q_id: 5, sub_id: 'c', answer: '1', confidence: null },
      { q_id: 5, sub_id: 'd', answer: '0', confidence: null },
      { q_id: 6, sub_id: null, answer: '-3.5', confidence: null },
      { q_id: 7, sub_id: null, answer: '42', confidence: null },
    ])
  })

  it('safely abstains on all 10 perspective-fixture cells with one warning', async () => {
    const result = parseStudentPhotoAnswers(
      await textFixture('cohere-student-perspective.md'),
      PINNED_SCHEMA,
    )

    expect(result.answers).toHaveLength(10)
    expect(result.answers.every(row => row.answer === null && row.confidence === null)).toBe(true)
    expect(result.warnings).toHaveLength(1)
  })

  it.each([
    ['malformed', '<table><tr><td>1</td><td>?</td></tr></table>'],
    ['pipe-only', '| Q | A | B |\n|---|---|---|\n|1||✓|'],
    ['out-of-schema', '<table><tr><td>Câu</td><td>Answer</td></tr><tr><td>99</td><td>42</td></tr></table>'],
    ['duplicate', '<table><tr><td>Câu</td><td>Answer</td></tr><tr><td>6</td><td>1</td></tr><tr><td>6</td><td>1</td></tr></table>'],
    ['conflict', '<table><tr><td>Câu</td><td>Answer</td></tr><tr><td>6</td><td>1</td></tr><tr><td>6</td><td>2</td></tr></table>'],
  ])('does not emit unsafe %s OCR output', (_name, markdown) => {
    const result = parseStudentPhotoAnswers(markdown, PINNED_SCHEMA)

    expect(result.answers).toHaveLength(10)
    expect(result.answers.every(row => row.answer === null)).toBe(true)
    expect(result.warnings).toHaveLength(1)
  })

  it('does not map a repeated local number unless the pinned identity is unique', () => {
    const schema = [
      { q_id: 1, section_key: 'section-1', local_number: 1, type: 'mcq', sub_id: null },
      { q_id: 2, section_key: 'section-2', local_number: 1, type: 'mcq', sub_id: null },
    ]
    const markdown = '<table><tr><td>Q</td><td>A</td><td>B</td><td>C</td><td>D</td></tr><tr><td>1</td><td></td><td>✓</td><td></td><td></td></tr></table>'

    const result = parseStudentPhotoAnswers(markdown, schema)

    expect(result.answers.map(row => row.answer)).toEqual([null, null])
    expect(result.warnings).toHaveLength(1)
  })

  it('normalizes OCR D and Đ only in a recognized direct true/false table', () => {
    const schema = ['a', 'b', 'c', 'd'].map(sub_id => ({
      q_id: 1, local_number: 1, type: 'boolean', sub_id,
    }))
    const markdown = '<table><tr><td>Câu</td><td>Ý</td><td>Đúng / Sai</td></tr><tr><td>1</td><td>a</td><td>D</td></tr><tr><td>1</td><td>b</td><td>Đ</td></tr><tr><td>1</td><td>c</td><td>S</td></tr><tr><td>1</td><td>d</td><td>S</td></tr></table>'

    const result = parseStudentPhotoAnswers(markdown, schema)

    expect(result.answers.map(row => row.answer)).toEqual(['1', '1', '0', '0'])
    expect(result.warnings).toEqual([])
  })
})
