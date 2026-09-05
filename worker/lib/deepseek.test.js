import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestSchemaFromDeepSeek } from './deepseek.js'

describe('DeepSeek schema extraction prompt', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests globally ordered, section-aware question descriptors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"schema":[]}' } }],
    }), { status: 200 }))

    await requestSchemaFromDeepSeek({ DEEPSEEK_API_KEY: 'test-key' }, 'Phần I\nCâu 1. A', 1)

    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(request.body)
    const prompt = body.messages[0].content
    expect(prompt).toContain('"section_key":"section-1"')
    expect(prompt).toContain('"section_title":"Phần I"')
    expect(prompt).toContain('"local_number":1')
    expect(prompt).toContain('Assign q_id as a positive global slot in document order')
    expect(prompt).toContain('local_number resets to 1 in each section')
    expect(prompt).toContain('Preserve each Unicode section title exactly')
  })
})
