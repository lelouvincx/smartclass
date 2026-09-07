import { vi } from 'vitest'
import {
  AnswerPdfPreparationError,
  extractGreenMcqAnswerRowsFromPageEvidence,
  extractTextFromPdf,
  prepareAnswerPdfForParsing,
} from './pdf'

const MIB = 1024 * 1024

function makePdfjs(pageItems) {
  const pages = pageItems.map((items, index) => ({
    getTextContent: vi.fn().mockResolvedValue({
      items: (Array.isArray(items) ? items : [items]).map((str) => ({ str })),
    }),
    getViewport: vi.fn(({ scale }) => ({
      width: 600 * scale,
      height: 800 * scale,
      pageNumber: index + 1,
    })),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
  }))
  const pdf = {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber) => pages[pageNumber - 1]),
  }
  const pdfjs = {
    getDocument: vi.fn(() => ({ promise: Promise.resolve(pdf) })),
  }

  return { pdfjs, pdf, pages }
}

function makeSourceFile() {
  return {
    arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
  }
}

function usePngSizes(sizes) {
  let index = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({})
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob([new Uint8Array(sizes[index] ?? 32)], { type: 'image/png' }))
    index += 1
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractTextFromPdf', () => {
  it('preserves ordered, whitespace-normalized text extraction', async () => {
    const { pdfjs } = makePdfjs([
      [' First ', 'answer\nline '],
      ['Second', ' page'],
    ])

    await expect(extractTextFromPdf(makeSourceFile(), { pdfjs })).resolves.toBe(
      'First answer line\nSecond page',
    )
  })
})

describe('extractGreenMcqAnswerRowsFromPageEvidence', () => {
  it('maps highlighted multiple-choice options to answer schema rows', () => {
    const rows = extractGreenMcqAnswerRowsFromPageEvidence([
      {
        pageNumber: 1,
        regions: [
          { x: 100, y: 90, width: 24, height: 10, pixelCount: 240 },
          { x: 220, y: 190, width: 24, height: 10, pixelCount: 240 },
        ],
        textItems: [
          { text: 'Câu', x: 20, y: 20, width: 24, height: 10 },
          { text: '1:', x: 48, y: 20, width: 10, height: 10 },
          { text: 'A.', x: 20, y: 90, width: 12, height: 10 },
          { text: 'B.', x: 82, y: 90, width: 12, height: 10 },
          { text: 'Câu 2:', x: 20, y: 130, width: 40, height: 10 },
          { text: 'C.', x: 20, y: 190, width: 12, height: 10 },
          { text: 'D.', x: 202, y: 190, width: 12, height: 10 },
        ],
      },
    ])

    expect(rows).toEqual([
      { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B', confidence: 1 },
      { q_id: 2, sub_id: null, type: 'mcq', correct_answer: 'D', confidence: 1 },
    ])
  })

  it('keeps ambiguous detected questions as blank review rows instead of inventing answers', () => {
    const rows = extractGreenMcqAnswerRowsFromPageEvidence([
      {
        pageNumber: 1,
        regions: [
          { x: 100, y: 90, width: 24, height: 10, pixelCount: 240 },
          { x: 150, y: 110, width: 24, height: 10, pixelCount: 240 },
        ],
        textItems: [
          { text: 'Câu 1:', x: 20, y: 20, width: 40, height: 10 },
          { text: 'B.', x: 82, y: 90, width: 12, height: 10 },
          { text: 'C.', x: 132, y: 110, width: 12, height: 10 },
        ],
      },
    ])

    expect(rows).toEqual([
      { q_id: 1, sub_id: null, type: 'mcq', correct_answer: '', confidence: null },
    ])
  })
})

describe('prepareAnswerPdfForParsing', () => {
  it('selects diacritic-insensitive headings and compact signatures without selecting every page', async () => {
    usePngSizes([10, 11, 12, 13])
    const { pdfjs } = makePdfjs([
      ['  BẢNG   ĐÁP ', ' ÁN  '],
      'continued rows',
      'ordinary lesson text',
      '1.A   2-b  3) C',
      'more continued rows',
      'appendix',
    ])

    const result = await prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })

    expect(result.total_pages).toBe(6)
    expect(result.page_manifest).toEqual([
      { file_name: 'page-1.png', page_number: 1, text: 'BẢNG ĐÁP ÁN' },
      { file_name: 'page-2.png', page_number: 2, text: 'continued rows' },
      { file_name: 'page-4.png', page_number: 4, text: '1.A 2-b 3) C' },
      { file_name: 'page-5.png', page_number: 5, text: 'more continued rows' },
    ])
    expect(result.page_files.map((file) => [file.name, file.type])).toEqual([
      ['page-1.png', 'image/png'],
      ['page-2.png', 'image/png'],
      ['page-4.png', 'image/png'],
      ['page-5.png', 'image/png'],
    ])
  })

  it('does not add the next page when detailed solutions show the table has ended', async () => {
    usePngSizes([10])
    const { pdfjs } = makePdfjs([
      'ĐÁP ÁN 1.A 2.B 3.C HƯỚNG DẪN GIẢI CHI TIẾT',
      'ordinary solution continuation',
    ])

    const result = await prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })

    expect(result.page_manifest.map(({ page_number }) => page_number)).toEqual([1])
  })

  it('loads the PDF once, reads every page in order, and renders at 150 DPI', async () => {
    usePngSizes([10, 10])
    const source = makeSourceFile()
    const { pdfjs, pdf, pages } = makePdfjs(['cover', 'Bảng đáp án', 'continuation'])

    await prepareAnswerPdfForParsing(source, { pdfjs })

    expect(source.arrayBuffer).toHaveBeenCalledTimes(1)
    expect(pdfjs.getDocument).toHaveBeenCalledTimes(1)
    expect(pdf.getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3])
    expect(pages.every((page) => page.getTextContent.mock.invocationCallOrder.length === 1)).toBe(true)
    for (const page of pages.slice(1)) {
      expect(page.getViewport).toHaveBeenCalledWith({ scale: 150 / 72 })
      expect(page.render).toHaveBeenCalledWith(expect.objectContaining({
        canvasContext: {},
        viewport: expect.objectContaining({ pageNumber: expect.any(Number) }),
      }))
    }
  })

  it('reports measurable reading and rendering progress', async () => {
    usePngSizes([10, 10])
    const { pdfjs } = makePdfjs(['Bảng đáp án', 'continued'])
    const onProgress = vi.fn()

    await prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs, onProgress })

    expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
      { stage: 'reading', current: 0, total: 2 },
      { stage: 'reading', current: 1, total: 2 },
      { stage: 'reading', current: 2, total: 2 },
      { stage: 'rendering', current: 0, total: 2 },
      { stage: 'rendering', current: 1, total: 2 },
      { stage: 'rendering', current: 2, total: 2 },
    ])
  })

  it('throws a recoverable unsupported-document error when no page matches', async () => {
    const { pdfjs } = makePdfjs(['lesson', 'questions', 'appendix'])

    await expect(prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })).rejects.toMatchObject({
      name: 'AnswerPdfPreparationError',
      code: 'UNSUPPORTED_DOCUMENT',
      recoverable: true,
    })
  })

  it('rejects more than 10 selected pages before rendering', async () => {
    const { pdfjs, pages } = makePdfjs(Array.from({ length: 11 }, () => 'Bảng đáp án'))

    await expect(prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })).rejects.toMatchObject({
      code: 'TOO_MANY_PAGES',
      recoverable: true,
    })
    expect(pages.every((page) => page.render.mock.calls.length === 0)).toBe(true)
  })

  it('rejects a PNG larger than 3 MiB', async () => {
    usePngSizes([3 * MIB + 1])
    const { pdfjs } = makePdfjs(['Bảng đáp án'])

    await expect(prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })).rejects.toMatchObject({
      code: 'PAGE_TOO_LARGE',
      recoverable: true,
    })
  })

  it('rejects total image bytes larger than 25 MiB', async () => {
    usePngSizes([...Array(8).fill(3 * MIB), 1 * MIB, 1])
    const { pdfjs } = makePdfjs(Array.from({ length: 10 }, () => 'Bảng đáp án'))

    await expect(prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })).rejects.toMatchObject({
      code: 'TOTAL_TOO_LARGE',
      recoverable: true,
    })
  })

  it('reserves room for manifest text and multipart framing inside the 25 MiB limit', async () => {
    usePngSizes(Array(9).fill(2_902_000))
    const { pdfjs } = makePdfjs(Array(9).fill(`Bảng đáp án ${'x'.repeat(5_000)}`))

    await expect(prepareAnswerPdfForParsing(makeSourceFile(), { pdfjs })).rejects.toMatchObject({
      code: 'TOTAL_TOO_LARGE',
      recoverable: true,
    })
  })

  it('exports a typed recoverable error for callers', () => {
    const error = new AnswerPdfPreparationError('UNSUPPORTED_DOCUMENT', 'Unsupported')
    expect(error).toMatchObject({ recoverable: true, code: 'UNSUPPORTED_DOCUMENT' })
  })
})
