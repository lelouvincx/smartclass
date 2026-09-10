import { env } from 'cloudflare:test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../test/helpers.js'
import { loginAsStudent, loginAsTeacher, seedStudent, seedTeacher } from '../test/helpers.js'

let teacherToken
let studentToken

beforeAll(async () => {
  await seedTeacher()
  await seedStudent('+84900000081', 'Schema Parse Student')
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent('+84900000081')
})

afterEach(() => {
  vi.unstubAllGlobals()
  env.COHERE_API_KEY = ''
  env.COHERE_TIMEOUT_MS = ''
})

function cohereResponse(markdown, status = 200) {
  return new Response(JSON.stringify({
    pages: [{ markdown: { content: markdown } }],
    meta: { billed_units: { pages: 1 } },
  }), { status })
}

function parseForm(entries = [
  { file_name: 'page-1.png', page_number: 2, text: 'Trường THPT PHẦN I. TRẮC NGHIỆM BẢNG ĐÁP ÁN' },
]) {
  const form = new FormData()
  for (const entry of entries) {
    form.append('page', new File([new Uint8Array(entry.size ?? 8)], entry.actual_name ?? entry.file_name, {
      type: entry.type ?? 'image/png',
    }))
  }
  form.append('page_manifest', JSON.stringify(entries.map(({ file_name, page_number, text }) => ({
    file_name, page_number, text,
  }))))
  return form
}

function post(form, token = teacherToken, headers = {}) {
  return app.request('/api/exercises/schema/parse', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body: form,
  }, env)
}

describe('multipart POST /api/exercises/schema/parse', () => {
  it('requires teacher authentication', async () => {
    expect((await post(parseForm(), '')).status).toBe(401)
    expect((await post(parseForm(), studentToken)).status).toBe(403)
  })

  it('returns unscored section-aware schema and Cohere request metadata', async () => {
    env.COHERE_API_KEY = 'test-key'
    const markdown = [
      '<table><tr><td>1.A</td></tr></table>',
      '<table><tr><td>2</td></tr><tr><td>a.Đ</td></tr><tr><td>b.S</td></tr><tr><td>c.Đ</td></tr><tr><td>d.S</td></tr></table>',
      '<table><tr><td>Câu</td><td>3</td></tr><tr><td>Đáp án</td><td>-1,5</td></tr></table>',
    ].join('\n')
    const fetchMock = vi.fn(async () => cohereResponse(markdown))
    vi.stubGlobal('fetch', fetchMock)
    const form = parseForm()
    form.append('expected_question_count', '3')
    form.append('schema_shape', JSON.stringify([
      { q_id: 11, section_key: 'main', section_title: null, local_number: 1, type: 'mcq', sub_id: null },
      ...['a', 'b', 'c', 'd'].map(sub_id => ({ q_id: 12, section_key: 'main', section_title: null, local_number: 2, type: 'boolean', sub_id })),
      { q_id: 13, section_key: 'main', section_title: null, local_number: 3, type: 'numeric', sub_id: null },
    ]))

    const response = await post(form)
    expect(response.status).toBe(200)
    const body = (await response.json()).data
    expect(body).toMatchObject({
      confidence: null,
      model_id: 'parse-v5.0',
      pages_processed: 1,
      timings_ms: { provider: expect.any(Number), parse: expect.any(Number), total: expect.any(Number) },
    })
    expect(body.schema).toHaveLength(6)
    expect(body.schema).toEqual(expect.arrayContaining([
      expect.objectContaining({ q_id: 11, section_key: 'main', local_number: 1, type: 'mcq', correct_answer: 'A', confidence: null }),
      expect.objectContaining({ q_id: 12, local_number: 2, type: 'boolean', sub_id: 'a', correct_answer: '1', confidence: null }),
      expect.objectContaining({ q_id: 13, local_number: 3, type: 'numeric', correct_answer: '-1.5', confidence: null }),
    ]))
    expect(body.warnings[0]).toMatch(/Review every extracted answer/)
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.cohere.com/v2/parse')
    expect(request.headers.Authorization).toBe('Bearer test-key')
    const providerBody = JSON.parse(request.body)
    expect(providerBody.model).toBe('parse-v5.0')
    expect(providerBody.document.image_url).toMatch(/^data:image\/png;base64,/)
  })

  it('runs at most 3 provider calls concurrently', async () => {
    env.COHERE_API_KEY = 'test-key'
    let active = 0
    let maximum = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return cohereResponse('<table><tr><td>1.A</td></tr></table>')
    }))
    const entries = Array.from({ length: 7 }, (_, index) => ({
      file_name: `page-${index + 1}.png`, page_number: index + 1,
      text: `PHẦN ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][index]}`,
    }))

    expect((await post(parseForm(entries))).status).toBe(200)
    expect(maximum).toBe(3)
  })

  it('keeps successful pages and reports failed page numbers', async () => {
    env.COHERE_API_KEY = 'test-key'
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1
      return call === 1
        ? cohereResponse('<table><tr><td>1.C</td></tr></table>')
        : new Response('{}', { status: 503 })
    }))
    const response = await post(parseForm([
      { file_name: 'one.png', page_number: 1, text: 'PHẦN I. FIRST' },
      { file_name: 'two.png', page_number: 2, text: 'PHẦN II. SECOND' },
    ]))

    expect(response.status).toBe(200)
    const data = (await response.json()).data
    expect(data.pages_processed).toBe(1)
    expect(data.schema[0].correct_answer).toBe('C')
    expect(data.warnings).toContain('Page 2 could not be read and was skipped.')
  })

  it('returns 422 when Cohere reads a page but no supported answer table is extracted', async () => {
    env.COHERE_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => cohereResponse(
      '<table><tr><td>Worked solution</td></tr><tr><td>Choose a method</td></tr></table>',
    )))

    const response = await post(parseForm())

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('UNSUPPORTED_DOCUMENT')
  })

  it('returns 422 for mixed page failures when the only readable page has no supported schema rows', async () => {
    env.COHERE_API_KEY = 'test-key'
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1
      return call === 8
        ? cohereResponse('<table><tr><td>Unsupported solution notes</td></tr></table>')
        : new Response('{}', { status: 503 })
    }))
    const entries = [2, 5, 6, 7, 8, 9, 10, 11].map(pageNumber => ({
      file_name: `page-${pageNumber}.png`,
      page_number: pageNumber,
      text: pageNumber === 10 ? 'TRẢ LỜI' : 'ordinary worked-solution text',
    }))

    const response = await post(parseForm(entries))

    expect(response.status).toBe(422)
    expect((await response.json()).error.code).toBe('UNSUPPORTED_DOCUMENT')
  })

  it('keeps usable answers when another readable page has an unsupported table', async () => {
    env.COHERE_API_KEY = 'test-key'
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1
      return call === 1
        ? cohereResponse('<table><tr><td>1.A</td></tr></table>')
        : cohereResponse('<table><tr><td>Unsupported solution notes</td></tr></table>')
    }))

    const response = await post(parseForm([
      { file_name: 'one.png', page_number: 1, text: 'BẢNG ĐÁP ÁN' },
      { file_name: 'two.png', page_number: 2, text: 'TRẢ LỜI' },
    ]))

    expect(response.status).toBe(200)
    const data = (await response.json()).data
    expect(data.schema).toHaveLength(1)
    expect(data.schema[0].correct_answer).toBe('A')
    expect(data.confidence).toBeNull()
  })

  it.each([
    ['missing key', () => {}, undefined],
    ['provider error', () => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 }))), 'test-key'],
    ['malformed response', () => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}'))), 'test-key'],
  ])('returns 502 when every page has a %s failure', async (_name, stub, key) => {
    env.COHERE_API_KEY = key ?? ''
    stub()
    const response = await post(parseForm())
    expect(response.status).toBe(502)
    expect((await response.json()).error.code).toBe('PARSE_FAILED')
  })

  it('returns 502 on provider timeout without retrying', async () => {
    env.COHERE_API_KEY = 'test-key'
    env.COHERE_TIMEOUT_MS = '1'
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    expect((await post(parseForm())).status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['JSON body', async () => app.request('/api/exercises/schema/parse', { method: 'POST', headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' }, body: '{}' }, env), 415],
    ['no pages', async () => { const form = new FormData(); form.append('page_manifest', '[]'); return post(form) }, 400],
    ['too many pages', async () => post(parseForm(Array.from({ length: 11 }, (_, i) => ({ file_name: `${i}.png`, page_number: i + 1, text: '' })))), 400],
    ['wrong media type', async () => post(parseForm([{ file_name: 'x.jpg', page_number: 1, text: '', type: 'image/jpeg' }])), 415],
    ['oversized page', async () => post(parseForm([{ file_name: 'x.png', page_number: 1, text: '', size: 3 * 1024 * 1024 + 1 }])), 413],
    ['manifest count mismatch', async () => { const form = parseForm(); form.set('page_manifest', '[]'); return post(form) }, 400],
    ['file-name mismatch', async () => post(parseForm([{ file_name: 'expected.png', actual_name: 'actual.png', page_number: 1, text: '' }])), 400],
    ['duplicate names', async () => post(parseForm([{ file_name: 'x.png', page_number: 1, text: '' }, { file_name: 'x.png', page_number: 2, text: '' }])), 400],
    ['duplicate page number', async () => post(parseForm([{ file_name: 'x.png', page_number: 1, text: '' }, { file_name: 'y.png', page_number: 1, text: '' }])), 400],
    ['out-of-order pages', async () => post(parseForm([{ file_name: 'x.png', page_number: 2, text: '' }, { file_name: 'y.png', page_number: 1, text: '' }])), 400],
    ['zero-based page', async () => post(parseForm([{ file_name: 'x.png', page_number: 0, text: '' }])), 400],
    ['oversized text', async () => post(parseForm([{ file_name: 'x.png', page_number: 1, text: 'x'.repeat(120_001) }])), 400],
    ['invalid expected count', async () => { const form = parseForm(); form.append('expected_question_count', '1.5'); return post(form) }, 400],
    ['invalid schema shape', async () => { const form = parseForm(); form.append('schema_shape', '{}'); return post(form) }, 400],
    ['repeated schema shape', async () => { const form = parseForm(); form.append('schema_shape', '[]'); form.append('schema_shape', '[]'); return post(form) }, 400],
    ['unexpected file', async () => { const form = parseForm(); form.append('other', new File(['x'], 'x.png', { type: 'image/png' })); return post(form) }, 400],
    ['oversized multipart request', async () => post(parseForm(), teacherToken, { 'Content-Length': String(25 * 1024 * 1024 + 1) }), 413],
  ])('rejects %s before any provider call', async (_name, request, status) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await request()).status).toBe(status)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
