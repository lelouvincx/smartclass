import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseAnswerPdfImagesWithCohereBlocks } from './cohere-answer-blocks.js'

const IMAGE_BYTES = new Uint8Array([0, 1, 2, 255])

function blocksResponse(html) {
  return new Response(JSON.stringify({
    pages: [{
      type: 'blocks',
      blocks: [
        { type: 'text', text: { content: '<table><tr><td>99.D</td></tr></table>' } },
        { type: 'table', table: { type: 'html', html } },
      ],
    }],
    meta: { billed_units: { pages: 1 } },
  }), { status: 200 })
}

function textOnlyBlocksResponse() {
  return new Response(JSON.stringify({
    pages: [{
      type: 'blocks',
      blocks: [{ type: 'text', text: { content: 'Answer prose only' } }],
    }],
    meta: { billed_units: { pages: 1 } },
  }), { status: 200 })
}

describe('experimental Cohere blocks Answer PDF adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls Parse v5 with blocks and returns schema rows from table blocks', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(blocksResponse('<table><tr><td>1.A</td></tr></table>'))
      .mockResolvedValueOnce(blocksResponse('<table><tr><td>1.B</td></tr></table>'))

    const result = await parseAnswerPdfImagesWithCohereBlocks({
      COHERE_API_KEY: 'secret-key',
      COHERE_BASE_URL: 'https://cohere.test',
    }, [
      { page_number: 1, text: 'PHẦN I. FIRST', imageBytes: IMAGE_BYTES, contentType: 'image/png' },
      { page_number: 2, text: 'PHẦN II. SECOND', imageBytes: IMAGE_BYTES, contentType: 'image/png' },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, request] of fetchMock.mock.calls) {
      expect(JSON.parse(request.body)).toMatchObject({
        model: 'parse-v5.0',
        output_format: 'blocks',
      })
    }
    expect(result.schema.map(row => [row.section_key, row.local_number, row.correct_answer])).toEqual([
      ['section-1', 1, 'A'],
      ['section-2', 1, 'B'],
    ])
    expect(result.warnings).toEqual([])
    expect(result.billed_pages).toBe(2)
    expect(result.provider_ms).toEqual(expect.any(Number))
  })

  it('keeps pages without table blocks as parser warnings instead of failing the experiment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(textOnlyBlocksResponse())

    const result = await parseAnswerPdfImagesWithCohereBlocks({
      COHERE_API_KEY: 'secret-key',
      COHERE_BASE_URL: 'https://cohere.test',
    }, [
      { page_number: 7, text: 'No table here', imageBytes: IMAGE_BYTES, contentType: 'image/png' },
    ])

    expect(result.schema).toEqual([])
    expect(result.warnings).toEqual(['Page 7 has no supported answer table.'])
    expect(result.billed_pages).toBe(1)
  })
})
