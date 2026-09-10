import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractAnswersFromImage, getSubmission, getSubmissionAnswerPdf, getSubmissionExercisePdf, joinWorkspace, listLectures, parseExerciseSchema, updateStudentGlobalStatus, uploadGeneratedQuestionAsset } from './api'

describe('API errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects unsupported origins before sending credentials', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://unknown.test' } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getSubmission('secret', 10)).rejects.toThrow('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['maths', 'english'])('maps fetch and both upload-progress paths to the %s API', async (site) => {
    vi.stubGlobal('window', { location: { origin: `http://${site}.test` } })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} })))
    vi.stubGlobal('fetch', fetchMock)
    const requests = []
    vi.stubGlobal('XMLHttpRequest', class {
      upload = {}
      status = 200
      responseText = JSON.stringify({ success: true, data: {} })
      open(method, url) { this.method = method; this.url = url }
      setRequestHeader(name, value) { this[name] = value }
      send() { requests.push(this); this.onload() }
    })
    await listLectures(`${site}-token`)
    await uploadGeneratedQuestionAsset(`${site}-token`, 12, 34, { blob: new Blob(['image']), fileName: 'question.webp' })
    await extractAnswersFromImage(`${site}-token`, 56, new File(['image'], 'answers.png'))
    expect(fetchMock.mock.calls[0][0]).toBe(`http://${site}-api.test/api/lectures`)
    expect(requests.map(({ url, Authorization }) => [url, Authorization])).toEqual([
      [`http://${site}-api.test/api/exercises/12/question-asset-sets/34/assets`, `Bearer ${site}-token`],
      [`http://${site}-api.test/api/submissions/56/extract`, `Bearer ${site}-token`],
    ])
  })

  it('sends explicit join and global status operations through the mapped request boundary', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: {} }))))
    vi.stubGlobal('fetch', fetchMock)
    await joinWorkspace('token', { grades: [10, 12] })
    await updateStudentGlobalStatus('token', 7, { disabled: false })
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options.method, JSON.parse(options.body)])).toEqual([
      ['http://maths-api.test/api/auth/join', 'POST', { grades: [10, 12] }],
      ['http://maths-api.test/api/users/7/global-status', 'PUT', { disabled: false }],
    ])
  })

  it('retains the HTTP status and API error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'NOT_FOUND', message: 'Submission not found' },
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(getSubmission('token', 10)).rejects.toMatchObject({
      message: 'Submission not found',
      status: 404,
      code: 'NOT_FOUND',
    })
  })

  it('replaces browser network errors with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(getSubmission('token', 10)).rejects.toThrow(
      'SmartClass can’t reach the server right now. Try again in a moment.',
    )
  })

  it('downloads the source PDF through the owned submission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('pdf', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSubmissionExercisePdf('student-token', 10)

    expect(result).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://maths-api.test/api/submissions/10/exercise-pdf',
      { headers: { Authorization: 'Bearer student-token' } },
    )
  })

  it('downloads the Answer PDF through the owned submitted submission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('pdf', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSubmissionAnswerPdf('student-token', 10)

    expect(result).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://maths-api.test/api/submissions/10/answer-pdf',
      { headers: { Authorization: 'Bearer student-token' } },
    )
  })

  it('omits authorization when a Guest lists lectures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await listLectures()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://maths-api.test/api/lectures',
      { headers: {} },
    )
  })

  it('sends prepared Answer PDF pages as multipart data without setting Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { schema: [] },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const firstPage = new File(['page one'], 'page-3.png', { type: 'image/png' })
    const secondPage = new File(['page two'], 'page-4.png', { type: 'image/png' })
    const pageManifest = [
      { file_name: 'page-3.png', page_number: 3, text: 'ĐÁP ÁN' },
      { file_name: 'page-4.png', page_number: 4, text: '1 A 2 B' },
    ]

    await parseExerciseSchema('teacher-token', {
      page_files: [firstPage, secondPage],
      page_manifest: pageManifest,
      total_pages: 8,
      expected_question_count: 2,
      schema_shape: [{
        q_id: 1,
        section_key: 'main',
        section_title: null,
        local_number: 1,
        type: 'mcq',
        sub_id: null,
      }],
    })

    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).toEqual({ Authorization: 'Bearer teacher-token' })
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.getAll('page')).toEqual([firstPage, secondPage])
    expect(JSON.parse(options.body.get('page_manifest'))).toEqual(pageManifest)
    expect(options.body.get('expected_question_count')).toBe('2')
    expect(JSON.parse(options.body.get('schema_shape'))).toEqual([{
      q_id: 1,
      section_key: 'main',
      section_title: null,
      local_number: 1,
      type: 'mcq',
      sub_id: null,
    }])
  })
})
