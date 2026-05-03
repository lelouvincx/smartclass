import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AnswerImageUpload from './answer-image-upload'

// Bypass userEvent.upload (which filters by accept/size) — drive the input directly.
function uploadFile(input, file) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  })
  fireEvent.change(input)
}

// --- Mocks ---

const extractMock = vi.fn()
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    extractAnswersFromImage: (...args) => extractMock(...args),
  }
})

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const toastMock = vi.hoisted(() => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

// --- Helpers ---

function makeFile(name, type, sizeBytes) {
  // Build a Blob of the requested size; jsdom's File reports .size correctly.
  const buf = new Uint8Array(sizeBytes)
  return new File([buf], name, { type })
}

function jpgFile(sizeBytes = 1024) {
  return makeFile('answer.jpg', 'image/jpeg', sizeBytes)
}

beforeEach(() => {
  extractMock.mockReset()
  toastMock.success.mockReset()
  toastMock.warning.mockReset()
  // jsdom does not implement createObjectURL on Blobs.
  global.URL.createObjectURL = vi.fn(() => 'blob:preview-url')
  global.URL.revokeObjectURL = vi.fn()
})

// --- Tests ---

describe('AnswerImageUpload', () => {
  it('renders the dropzone in idle state', () => {
    render(<AnswerImageUpload submissionId={1} onExtracted={() => {}} />)
    expect(screen.getByText(/Drop a photo here/i)).toBeInTheDocument()
    // Students are not given a model picker (teacher-side configuration)
    expect(screen.queryByLabelText(/Extraction model/i)).not.toBeInTheDocument()
  })

  it('rejects non-image files client-side without calling the API', async () => {
    const user = userEvent.setup()
    render(<AnswerImageUpload submissionId={1} onExtracted={() => {}} />)
    const input = screen.getByLabelText(/Pick or capture answer sheet image/i)

    const txt = makeFile('notes.txt', 'text/plain', 100)
    uploadFile(input, txt)

    expect(extractMock).not.toHaveBeenCalled()
    expect(screen.getByText(/Only JPEG and PNG/i)).toBeInTheDocument()
  })

  it('rejects images larger than 20 MB client-side', async () => {
    const user = userEvent.setup()
    render(<AnswerImageUpload submissionId={1} onExtracted={() => {}} />)
    const input = screen.getByLabelText(/Pick or capture answer sheet image/i)

    const huge = jpgFile(21 * 1024 * 1024)
    uploadFile(input, huge)

    expect(extractMock).not.toHaveBeenCalled()
    expect(screen.getByText(/Maximum is 20 MB/i)).toBeInTheDocument()
  })

  it('moves to previewing on a valid pick and shows Extract button', async () => {
    const user = userEvent.setup()
    render(<AnswerImageUpload submissionId={1} onExtracted={() => {}} />)
    const input = screen.getByLabelText(/Pick or capture answer sheet image/i)

    uploadFile(input, jpgFile(2048))
    expect(screen.getByText('answer.jpg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Extract answers/i })).toBeInTheDocument()
  })

  it('calls extractAnswersFromImage and forwards the result on Extract', async () => {
    const onExtracted = vi.fn()
    extractMock.mockResolvedValue({
      file_id: 7,
      model_used: 'x-ai/grok-4.1-fast',
      extracted: [{ q_id: 1, sub_id: null, answer: 'B', confidence: 0.9 }],
      warnings: [],
    })

    const user = userEvent.setup()
    render(<AnswerImageUpload submissionId={42} onExtracted={onExtracted} />)
    uploadFile(screen.getByLabelText(/Pick or capture answer sheet image/i), jpgFile())
    await user.click(screen.getByRole('button', { name: /Extract answers/i }))

    await waitFor(() => expect(extractMock).toHaveBeenCalledTimes(1))
    // Model is intentionally undefined — teacher will configure it server-side later.
    expect(extractMock).toHaveBeenCalledWith(
      'test-token',
      42,
      expect.objectContaining({ name: 'answer.jpg' }),
      undefined,
      expect.objectContaining({ onProgress: expect.any(Function), signal: expect.any(AbortSignal) }),
    )
    await waitFor(() => expect(onExtracted).toHaveBeenCalledTimes(1))
    expect(onExtracted).toHaveBeenCalledWith(
      expect.objectContaining({
        extracted: [{ q_id: 1, sub_id: null, answer: 'B', confidence: 0.9 }],
        warnings: [],
        model_used: 'x-ai/grok-4.1-fast',
      }),
    )
    expect(screen.getByText(/Re-extract/i)).toBeInTheDocument()
  })

  it('shows a Retry button on failed extraction and re-issues the request with the same image', async () => {
    extractMock.mockRejectedValueOnce(new Error('boom'))
    extractMock.mockResolvedValueOnce({
      file_id: 1,
      model_used: 'x-ai/grok-4.1-fast',
      extracted: [{ q_id: 1, sub_id: null, answer: 'A', confidence: 0.9 }],
      warnings: [],
    })

    const user = userEvent.setup()
    const onExtracted = vi.fn()
    render(<AnswerImageUpload submissionId={1} onExtracted={onExtracted} />)
    uploadFile(screen.getByLabelText(/Pick or capture answer sheet image/i), jpgFile())
    await user.click(screen.getByRole('button', { name: /Extract answers/i }))

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
    const retryBtn = screen.getByRole('button', { name: /^Retry$/i })
    await user.click(retryBtn)
    await waitFor(() => expect(onExtracted).toHaveBeenCalledTimes(1))
    expect(extractMock).toHaveBeenCalledTimes(2)
    // Same File instance both times
    expect(extractMock.mock.calls[0][2]).toBe(extractMock.mock.calls[1][2])
  })

  it('shows warnings when the model returns any', async () => {
    extractMock.mockResolvedValue({
      file_id: 1,
      model_used: 'x-ai/grok-4.1-fast',
      extracted: [{ q_id: 1, sub_id: null, answer: 'A', confidence: 0.9 }],
      warnings: ['Q5 unreadable'],
    })

    const user = userEvent.setup()
    render(<AnswerImageUpload submissionId={1} onExtracted={() => {}} />)
    uploadFile(screen.getByLabelText(/Pick or capture answer sheet image/i), jpgFile())
    await user.click(screen.getByRole('button', { name: /Extract answers/i }))

    const toggle = await screen.findByRole('button', { name: /1 warning/i })
    await user.click(toggle)
    expect(screen.getByText('Q5 unreadable')).toBeInTheDocument()
  })

  it('lets the user replace the image after a successful extraction', async () => {
    extractMock.mockResolvedValue({
      file_id: 1,
      model_used: 'x-ai/grok-4.1-fast',
      extracted: [{ q_id: 1, sub_id: null, answer: 'A', confidence: 0.9 }],
      warnings: [],
    })

    const user = userEvent.setup()
    render(<AnswerImageUpload submissionId={1} onExtracted={() => {}} />)
    uploadFile(screen.getByLabelText(/Pick or capture answer sheet image/i), jpgFile())
    await user.click(screen.getByRole('button', { name: /Extract answers/i }))
    await screen.findByRole('button', { name: /Re-extract/i })

    await user.click(screen.getByRole('button', { name: /Replace image/i }))
    expect(screen.getByText(/Drop a photo here/i)).toBeInTheDocument()
  })
})
