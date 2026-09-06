import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSubmission, getSubmissionExercisePdf, parseExerciseSchema } from './api'

describe('API errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
      'http://localhost:8787/api/submissions/10/exercise-pdf',
      { headers: { Authorization: 'Bearer student-token' } },
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
