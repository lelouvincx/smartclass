import { afterEach, describe, expect, it, vi } from 'vitest'
import { COHERE_MODEL, parseImageBlocksWithCohere, parseImageWithCohere } from './cohere.js'

const IMAGE_BYTES = new Uint8Array([0, 1, 2, 255])

function successfulResponse(overrides = {}) {
  return new Response(JSON.stringify({
    pages: [{ markdown: { content: '<table><tr><td>1.B</td></tr></table>' } }],
    meta: { billed_units: { pages: 1 } },
    ...overrides,
  }), { status: 200 })
}

function successfulBlocksResponse(overrides = {}) {
  return new Response(JSON.stringify({
    pages: [{
      type: 'blocks',
      blocks: [{
        type: 'table',
        table: { type: 'html', html: '<table><tr><td>1.B</td></tr></table>' },
      }],
    }],
    meta: { billed_units: { pages: 1 } },
    ...overrides,
  }), { status: 200 })
}

describe('Cohere Parse client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sends one image using the documented Parse v5 request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulResponse())

    await parseImageWithCohere({
      COHERE_API_KEY: 'secret-key',
      COHERE_BASE_URL: 'https://cohere.test',
    }, { imageBytes: IMAGE_BYTES, contentType: 'image/png' })

    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('https://cohere.test/v2/parse')
    expect(request.method).toBe('POST')
    expect(request.headers).toEqual({
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(request.body)).toEqual({
      model: 'parse-v5.0',
      document: {
        type: 'image_url',
        image_url: 'data:image/png;base64,AAEC/w==',
      },
      output_format: 'markdown',
    })
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(COHERE_MODEL).toBe('parse-v5.0')
  })

  it('requires a provider key before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(parseImageWithCohere({}, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
    })).rejects.toThrow('COHERE_API_KEY is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts a request at the configured timeout without exposing input data', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, request) => new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    }))

    const result = parseImageWithCohere({
      COHERE_API_KEY: 'secret-key',
      COHERE_TIMEOUT_MS: 10,
    }, { imageBytes: IMAGE_BYTES, contentType: 'image/png' })
    const assertion = expect(result).rejects.toThrow('Cohere Parse request timed out')
    await vi.advanceTimersByTimeAsync(11)

    await assertion
  })

  it('uses the caller abort signal as well as its timeout', async () => {
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, request) => new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    }))

    const result = parseImageWithCohere({ COHERE_API_KEY: 'secret-key' }, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
      signal: controller.signal,
    })
    controller.abort()

    await expect(result).rejects.toThrow('Cohere Parse request was cancelled')
  })

  it('applies the timeout until the response body has been read', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(resolve => setTimeout(() => resolve({
        pages: [{ markdown: { content: '<table></table>' } }],
        meta: { billed_units: { pages: 1 } },
      }), 20)),
    })

    const result = parseImageWithCohere({
      COHERE_API_KEY: 'secret-key',
      COHERE_TIMEOUT_MS: 10,
    }, { imageBytes: IMAGE_BYTES, contentType: 'image/png' })
    const assertion = expect(result).rejects.toThrow('Cohere Parse request timed out')
    await vi.advanceTimersByTimeAsync(21)

    await assertion
  })

  it('rejects upstream failures without including the upstream body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: 'sensitive OCR and authorization text' }),
      { status: 429 },
    ))

    await expect(parseImageWithCohere({ COHERE_API_KEY: 'secret-key' }, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
    })).rejects.toThrow('Cohere Parse request failed with status 429')
  })

  it.each([
    ['invalid JSON', new Response('not-json', { status: 200 })],
    ['missing Markdown', successfulResponse({ pages: [{}] })],
  ])('rejects malformed responses: %s', async (_name, response) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    await expect(parseImageWithCohere({ COHERE_API_KEY: 'secret-key' }, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
    })).rejects.toThrow('Cohere Parse returned a malformed response')
  })

  it('rejects Markdown without an HTML table', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulResponse({
      pages: [{ markdown: { content: 'Answer PDF prose only' } }],
    }))

    await expect(parseImageWithCohere({ COHERE_API_KEY: 'secret-key' }, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
    })).rejects.toThrow('Cohere Parse returned no HTML table')
  })

  it('returns only Markdown and provider metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulResponse())

    const result = await parseImageWithCohere({ COHERE_API_KEY: 'secret-key' }, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
    })

    expect(result).toEqual({
      markdown: '<table><tr><td>1.B</td></tr></table>',
      provider_ms: expect.any(Number),
      billed_pages: 1,
    })
    expect(Object.keys(result)).toEqual(['markdown', 'provider_ms', 'billed_pages'])
  })

  it('can request experimental typed blocks for one image', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulBlocksResponse())

    const result = await parseImageBlocksWithCohere({
      COHERE_API_KEY: 'secret-key',
      COHERE_BASE_URL: 'https://cohere.test',
    }, { imageBytes: IMAGE_BYTES, contentType: 'image/png' })

    const [, request] = fetchMock.mock.calls[0]
    expect(JSON.parse(request.body)).toMatchObject({
      model: 'parse-v5.0',
      output_format: 'blocks',
    })
    expect(result).toEqual({
      blocks: [{
        type: 'table',
        table: { type: 'html', html: '<table><tr><td>1.B</td></tr></table>' },
      }],
      provider_ms: expect.any(Number),
      billed_pages: 1,
    })
  })

  it('rejects typed blocks without a table block by default', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulBlocksResponse({
      pages: [{ type: 'blocks', blocks: [{ type: 'text', text: { content: 'Answer PDF prose only' } }] }],
    }))

    await expect(parseImageBlocksWithCohere({ COHERE_API_KEY: 'secret-key' }, {
      imageBytes: IMAGE_BYTES,
      contentType: 'image/png',
    })).rejects.toThrow('Cohere Parse returned no table block')
  })
})
