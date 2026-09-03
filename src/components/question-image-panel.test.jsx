import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionImagePanel } from './question-image-panel'
import { getQuestionAssetBlob } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getQuestionAssetBlob: vi.fn(),
  }
})

const ASSETS = [
  { id: 11, q_id: 1, segment_index: 0, file_url: '/api/question-assets/11', accessible_text: 'First question' },
  { id: 22, q_id: 2, segment_index: 1, file_url: '/api/question-assets/22', accessible_text: 'Question two continuation' },
  { id: 21, q_id: 2, segment_index: 0, file_url: '/api/question-assets/21', accessible_text: 'Question two start' },
  { id: 31, q_id: 3, segment_index: 0, file_url: '/api/question-assets/31', accessible_text: null },
  { id: 41, q_id: 4, segment_index: 0, file_url: '/api/question-assets/41', accessible_text: 'Fourth question' },
]

describe('QuestionImagePanel', () => {
  beforeEach(() => {
    vi.mocked(getQuestionAssetBlob).mockReset()
    vi.mocked(getQuestionAssetBlob).mockImplementation(async (_token, fileUrl) => (
      new Blob([fileUrl], { type: 'image/webp' })
    ))
    global.URL.createObjectURL = vi.fn((blob) => `blob:${blob.size}:${Math.random()}`)
    global.URL.revokeObjectURL = vi.fn()
  })

  it('shows only the current question segments in segment order', async () => {
    render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS}
        currentQId={2}
        adjacentQIds={[1, 3]}
      />,
    )

    const images = await screen.findAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      'Question two start',
      'Question two continuation',
    ])
    expect(screen.queryByAltText('First question')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Fourth question')).not.toBeInTheDocument()
  })

  it('fetches the current question and only its adjacent questions', async () => {
    render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS}
        currentQId={2}
        adjacentQIds={[1, 3]}
      />,
    )

    await waitFor(() => expect(getQuestionAssetBlob).toHaveBeenCalledTimes(4))
    expect(vi.mocked(getQuestionAssetBlob).mock.calls.map(([, url]) => url)).toEqual(
      expect.arrayContaining([
        '/api/question-assets/11',
        '/api/question-assets/21',
        '/api/question-assets/22',
        '/api/question-assets/31',
      ]),
    )
    expect(getQuestionAssetBlob).not.toHaveBeenCalledWith('student-token', '/api/question-assets/41')
  })

  it('switches the visible image without rendering an iframe or full-PDF control', async () => {
    const { rerender } = render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS}
        currentQId={1}
        adjacentQIds={[2]}
      />,
    )

    expect(await screen.findByAltText('First question')).toBeInTheDocument()

    rerender(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS}
        currentQId={2}
        adjacentQIds={[1, 3]}
      />,
    )

    expect(await screen.findByAltText('Question two start')).toBeInTheDocument()
    expect(screen.queryByAltText('First question')).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pdf/i })).not.toBeInTheDocument()
  })

  it('shows a retry action when the selected image cannot be loaded', async () => {
    const user = userEvent.setup()
    vi.mocked(getQuestionAssetBlob)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(new Blob(['retry'], { type: 'image/webp' }))

    render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS.slice(0, 1)}
        currentQId={1}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load this question image/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByAltText('First question')).toBeInTheDocument()
    expect(getQuestionAssetBlob).toHaveBeenCalledTimes(2)
  })

  it('does not automatically retry a failed adjacent image when props rerender', async () => {
    vi.mocked(getQuestionAssetBlob).mockImplementation(async (_token, fileUrl) => {
      if (fileUrl === '/api/question-assets/21') throw new Error('Network error')
      return new Blob([fileUrl], { type: 'image/webp' })
    })

    const { rerender } = render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS}
        currentQId={1}
        adjacentQIds={[2]}
      />,
    )

    await waitFor(() => expect(getQuestionAssetBlob).toHaveBeenCalledTimes(3))
    rerender(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS}
        currentQId={1}
        adjacentQIds={[2]}
      />,
    )

    await waitFor(() => expect(getQuestionAssetBlob).toHaveBeenCalledTimes(3))
  })

  it('revokes a broken image URL and waits for an explicit retry', async () => {
    render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS.slice(0, 1)}
        currentQId={1}
      />,
    )

    const image = await screen.findByAltText('First question')
    const objectUrl = image.getAttribute('src')
    fireEvent.error(image)

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load this question image/i)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl)
    expect(getQuestionAssetBlob).toHaveBeenCalledTimes(1)
  })

  it('revokes generated object URLs when it unmounts', async () => {
    const { unmount } = render(
      <QuestionImagePanel
        token="student-token"
        assets={ASSETS.slice(0, 1)}
        currentQId={1}
      />,
    )

    await screen.findByAltText('First question')
    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})
