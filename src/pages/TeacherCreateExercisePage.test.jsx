import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherCreateExercisePage from './TeacherCreateExercisePage'

const createExerciseMock = vi.fn()
const getExerciseMock = vi.fn()
const parseExerciseSchemaMock = vi.fn()
const createQuestionAssetSetMock = vi.fn()
const uploadGeneratedQuestionAssetMock = vi.fn()
const updateExerciseMock = vi.fn()
const createExerciseFileUploadMock = vi.fn()
const uploadExerciseFileMock = vi.fn()
const prepareAnswerPdfForParsingMock = vi.fn()
const extractGreenHighlightedAnswerSchemaMock = vi.fn()
const extractDetailedAnswerKeySchemaMock = vi.fn()
const questionAssetWorkflowMock = vi.fn()
const generateQuestionAssetsMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createExercise: (...args) => createExerciseMock(...args),
    createQuestionAssetSet: (...args) => createQuestionAssetSetMock(...args),
    getExercise: (...args) => getExerciseMock(...args),
    parseExerciseSchema: (...args) => parseExerciseSchemaMock(...args),
    updateExercise: (...args) => updateExerciseMock(...args),
    uploadGeneratedQuestionAsset: (...args) => uploadGeneratedQuestionAssetMock(...args),
    createExerciseFileUpload: (...args) => createExerciseFileUploadMock(...args),
    uploadExerciseFile: (...args) => uploadExerciseFileMock(...args),
  }
})

vi.mock('../components/question-asset-workflow', () => ({
  default: (props) => {
    questionAssetWorkflowMock(props)
    return <section aria-label="Question views">Question views for {props.exercise.title}</section>
  },
}))

vi.mock('../lib/pdf', () => ({
  extractDetailedAnswerKeySchema: (...args) => extractDetailedAnswerKeySchemaMock(...args),
  extractGreenHighlightedAnswerSchema: (...args) => extractGreenHighlightedAnswerSchemaMock(...args),
  prepareAnswerPdfForParsing: (...args) => prepareAnswerPdfForParsingMock(...args),
}))

vi.mock('../lib/question-generation', () => ({
  generateQuestionAssets: (...args) => generateQuestionAssetsMock(...args),
}))

const logoutMock = vi.fn()

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
    logout: logoutMock,
  }),
}))

async function uploadRequiredPdfs() {
  fireEvent.change(screen.getByLabelText(/Exercise PDF/i), {
    target: {
      files: [new File(['exercise-pdf'], 'questions.pdf', { type: 'application/pdf' })],
    },
  })
  fireEvent.change(screen.getByLabelText(/Answer PDF/i), {
    target: {
      files: [new File(['answer-pdf'], 'answers.pdf', { type: 'application/pdf' })],
    },
  })
}

async function addManualQuestion(user) {
  await user.click(screen.getByRole('button', { name: /add question/i }))
}

async function chooseAnswerType(user, optionName) {
  await user.click(screen.getByLabelText(/answer type for question 1/i))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

describe('TeacherCreateExercisePage', () => {
  beforeEach(() => {
    if (!window.HTMLElement.prototype.hasPointerCapture) {
      window.HTMLElement.prototype.hasPointerCapture = () => false
    }
    if (!window.HTMLElement.prototype.scrollIntoView) {
      window.HTMLElement.prototype.scrollIntoView = () => {}
    }
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:preview')
    if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
    createExerciseMock.mockReset()
    getExerciseMock.mockReset()
    parseExerciseSchemaMock.mockReset()
    createQuestionAssetSetMock.mockReset()
    uploadGeneratedQuestionAssetMock.mockReset()
    updateExerciseMock.mockReset()
    createExerciseFileUploadMock.mockReset()
    uploadExerciseFileMock.mockReset()
    generateQuestionAssetsMock.mockReset()
    prepareAnswerPdfForParsingMock.mockReset()
    extractDetailedAnswerKeySchemaMock.mockReset()
    extractGreenHighlightedAnswerSchemaMock.mockReset()
    extractGreenHighlightedAnswerSchemaMock.mockResolvedValue([])
    extractDetailedAnswerKeySchemaMock.mockResolvedValue([])
    prepareAnswerPdfForParsingMock.mockResolvedValue({
      page_files: [new File(['page'], 'page-1.png', { type: 'image/png' })],
      page_manifest: [{ file_name: 'page-1.png', page_number: 1, text: 'ĐÁP ÁN' }],
      total_pages: 1,
    })
    getExerciseMock.mockImplementation(id => Promise.resolve({
      data: {
        id: Number(id),
        title: 'Created quiz',
        duration_minutes: 60,
        is_timed: 1,
        max_attempts: 1,
        allow_answer_pdf_download: 0,
        files: [
          { id: 91, file_type: 'exercise_pdf', file_name: 'questions.pdf' },
          { id: 92, file_type: 'solution_pdf', file_name: 'answers.pdf' },
        ],
        schema: [{ q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'A' }],
      },
    }))
    questionAssetWorkflowMock.mockReset()
    logoutMock.mockReset()
    createQuestionAssetSetMock.mockResolvedValue({ data: { id: 707 } })
    uploadGeneratedQuestionAssetMock.mockResolvedValue({ data: { id: 1 } })
    updateExerciseMock.mockResolvedValue({ data: { id: 1 } })
    generateQuestionAssetsMock.mockResolvedValue({
      detectorVersion: 'question-detector-test',
      detectionMethod: 'text',
      assets: [{
        id: 'preview-1',
        qId: 1,
        segmentIndex: 0,
        sourcePage: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        confidence: 1,
        blob: new Blob(['image'], { type: 'image/webp' }),
        pixelWidth: 100,
        pixelHeight: 100,
        fileName: 'question-1-1.webp',
      }],
      previewAssets: [{
        qId: 1,
        segmentIndex: 0,
        sourcePage: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        confidence: 1,
        blob: new Blob(['image'], { type: 'image/webp' }),
        pixelWidth: 100,
        pixelHeight: 100,
        fileName: 'question-1-1.webp',
      }],
      answerCandidates: [],
    })
  })

  it('lets the metadata form shrink to narrow mobile widths', () => {
    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    expect(screen.getByLabelText(/exercise title/i).parentElement?.parentElement).toHaveClass(
      'grid-cols-[minmax(0,1fr)]',
    )
    expect(screen.getByLabelText(/duration \(minutes\)/i).parentElement).toHaveClass('flex-col')
    expect(screen.getByRole('group', { name: /duration presets/i })).toHaveAttribute('data-slot', 'segmented-button-group')
    expect(screen.getByText(/questions: 0/i).parentElement).toHaveClass('flex-wrap')
    expect(screen.getByRole('button', { name: /programme access/i })).toHaveTextContent('Grade 12')
    expect(screen.queryByLabelText(/image-extraction model/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('exercise-pdf-upload')).toHaveClass('bg-sc-primary-container')
    expect(screen.getByTestId('answer-pdf-upload')).toHaveClass('bg-sc-tertiary-container')
    expect(screen.getByTestId('answer-pdf-upload')).not.toContainElement(screen.getByRole('button', { name: /read answers from pdf/i }))
    expect(screen.getByTestId('answer-parse-action')).toContainElement(screen.getByRole('button', { name: /read answers from pdf/i }))
    expect(screen.getByTestId('answer-parse-action')).not.toHaveClass('border', 'bg-muted/30', 'p-3')
  })

  it('defaults new exercises to one attempt', () => {
    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    expect(screen.getByRole('switch', { name: 'Limited' })).toBeChecked()
    expect(screen.getByLabelText('Maximum attempts')).toHaveValue(1)
  })

  it('requires a positive whole number for a limited attempt count', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Practice set')
    fireEvent.change(screen.getByLabelText('Maximum attempts'), { target: { value: '1.5' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save Exercise' }).closest('form'))

    expect(screen.getByText(/positive whole number/i)).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('requires separate student and teacher PDFs before saving', async () => {
    const user = userEvent.setup()

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Quiz 1')
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'B')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText('Upload both the student Exercise PDF and teacher Answer PDF.')).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('requires at least one answer row before saving', async () => {
    const user = userEvent.setup()

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Quiz 1')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText('At least one question is required')).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('saves a manual MCQ schema with both PDFs', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 101 } })

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Quiz 1')
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'B')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', {
      title: 'Quiz 1',
      is_timed: true,
      duration_minutes: 60,
      allow_answer_pdf_download: false,
      schema: [
        {
          q_id: 1,
          section_key: 'main',
          section_title: null,
          local_number: 1,
          type: 'mcq',
          correct_answer: 'B',
          max_score_hundredths: null,
        },
      ],
      grades: [12],
      max_attempts: 1,
    })
  })

  it('saves custom score hundredths and blocks an invalid custom total', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 103 } })
    createExerciseFileUploadMock.mockResolvedValue({ data: { r2_key: 'test', file_type: 'exercise_pdf' } })
    uploadExerciseFileMock.mockResolvedValue({ data: {} })
    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText(/exercise title/i), { target: { value: 'Scored quiz' } })
    await addManualQuestion(user)
    fireEvent.change(screen.getByLabelText(/correct answer for question 1/i), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText(/Exercise PDF/i), { target: { files: [new File(['pdf'], 'questions.pdf', { type: 'application/pdf' })] } })
    fireEvent.change(screen.getByLabelText(/Answer PDF/i), { target: { files: [new File(['pdf'], 'answers.pdf', { type: 'application/pdf' })] } })
    await user.click(screen.getByRole('radio', { name: 'Custom allocation' }))
    const score = screen.getByLabelText(/Points for question 1/i)
    fireEvent.change(score, { target: { value: '9.99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Exercise' }))

    await waitFor(() => expect(screen.getByRole('alert', { name: 'Fix score allocation' })).toHaveFocus())
    expect(createExerciseMock).not.toHaveBeenCalled()

    fireEvent.change(score, { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Exercise' }))
    await waitFor(() => expect(createExerciseMock).toHaveBeenCalledWith('test-token', expect.objectContaining({
      schema: [expect.objectContaining({ q_id: 1, max_score_hundredths: 1000 })],
    })))
  }, 15000)

  it('saves an unlimited attempt limit', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 102 } })

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Practice set')
    await user.click(screen.getByRole('switch', { name: 'Limited' }))
    expect(screen.getByRole('switch', { name: 'Unlimited' })).not.toBeChecked()
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'B')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ max_attempts: null }),
    )
  })

  it('keeps generate button disabled when answer pdf is missing', () => {
    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /Read answers from PDF/ })).toBeDisabled()
  })

  it('saves untimed exercise without duration value', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 202 } })

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Untimed Quiz')
    await user.click(screen.getByLabelText('Timed mode toggle'))
    const durationInput = screen.getByLabelText(/duration \(minutes\)/i)
    expect(durationInput).toBeDisabled()
    expect(durationInput).toHaveValue(null)
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'C')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', {
      title: 'Untimed Quiz',
      is_timed: false,
      duration_minutes: 0,
      allow_answer_pdf_download: false,
      schema: [
        {
          q_id: 1,
          section_key: 'main',
          section_title: null,
          local_number: 1,
          type: 'mcq',
          correct_answer: 'C',
          max_score_hundredths: null,
        },
      ],
      grades: [12],
      max_attempts: 1,
    })
  })

  it('blocks save when timed mode duration is empty', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Timed Quiz')
    await user.clear(screen.getByLabelText(/duration \(minutes\)/i))
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'A')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText('Duration must be a positive number')).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('shows parse failure and still allows manual save', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 303 } })
    parseExerciseSchemaMock.mockRejectedValue(new Error('Cohere unavailable'))

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    const answerPdf = new File(['fake-pdf'], 'answer.pdf', { type: 'application/pdf' })

    await user.type(screen.getByLabelText(/exercise title/i), 'Fallback Quiz')
    await user.upload(screen.getByLabelText(/Exercise PDF/i), new File(['pdf'], 'questions.pdf', { type: 'application/pdf' }))
    await user.upload(screen.getByLabelText(/Answer PDF/i), answerPdf)
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByText('Cohere unavailable')).toBeInTheDocument()

    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'D')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledTimes(1)
  })

  it('treats an empty parse success as a recoverable manual-entry state', async () => {
    const user = userEvent.setup()
    parseExerciseSchemaMock.mockResolvedValue({
      data: {
        schema: [],
        confidence: null,
        pages_processed: 1,
      },
    })

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'C')
    await user.upload(
      screen.getByLabelText(/Answer PDF/i),
      new File(['pdf'], 'answer.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByText(/Could not find a supported answer table/i)).toBeInTheDocument()
    expect(screen.queryByText('Answers are ready to review')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Could not read answers')
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(100)
    expect(screen.getByLabelText(/correct answer for question 1/i)).toHaveValue('C')
  })

  it('uses green-highlighted answer choices without sending the PDF to the table parser', async () => {
    const user = userEvent.setup()
    extractGreenHighlightedAnswerSchemaMock.mockResolvedValue([
      { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B', confidence: 1 },
      { q_id: 2, sub_id: null, type: 'mcq', correct_answer: 'D', confidence: 1 },
    ])

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.upload(
      screen.getByLabelText(/Answer PDF/i),
      new File(['answer-pdf'], 'answers.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByDisplayValue('B')).toBeInTheDocument()
    expect(screen.getByDisplayValue('D')).toBeInTheDocument()
    expect(screen.getByText('Answers are ready to review')).toBeInTheDocument()
    expect(parseExerciseSchemaMock).not.toHaveBeenCalled()
    expect(prepareAnswerPdfForParsingMock).not.toHaveBeenCalled()
  })

  it('uses detailed solution answer lines without sending the PDF to the table parser', async () => {
    const user = userEvent.setup()
    extractDetailedAnswerKeySchemaMock.mockResolvedValue([
      { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'D', confidence: 1 },
      { q_id: 2, sub_id: null, type: 'mcq', correct_answer: 'B', confidence: 1 },
    ])

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.upload(
      screen.getByLabelText(/Answer PDF/i),
      new File(['answer-pdf'], 'answers.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByDisplayValue('D')).toBeInTheDocument()
    expect(screen.getByDisplayValue('B')).toBeInTheDocument()
    expect(screen.getByText('Answers are ready to review')).toBeInTheDocument()
    expect(parseExerciseSchemaMock).not.toHaveBeenCalled()
    expect(prepareAnswerPdfForParsingMock).not.toHaveBeenCalled()
  })

  it('prepares question views inside the create form after reading answers', async () => {
    const user = userEvent.setup()
    extractDetailedAnswerKeySchemaMock.mockResolvedValue([
      { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'D', confidence: 1 },
    ])

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.upload(screen.getByLabelText(/Exercise PDF/i), new File(['exercise'], 'questions.pdf', { type: 'application/pdf' }))
    await user.upload(screen.getByLabelText(/Answer PDF/i), new File(['answer'], 'answers.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByRole('heading', { name: 'Question views' })).toBeInTheDocument()
    expect(screen.getByText('1 question views are ready to save.')).toBeInTheDocument()
    expect(screen.getByLabelText('Exercise PDF crop')).toBeInTheDocument()
    expect(screen.getByLabelText('Answer PDF crop (teacher-only)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Answer review' })).toBeInTheDocument()
    expect(screen.getByLabelText('Correct answer for question 1')).toHaveTextContent('D')
    expect(generateQuestionAssetsMock).toHaveBeenCalledWith(
      expect.any(File),
      [expect.objectContaining({ q_id: 1, local_number: 1 })],
      expect.objectContaining({ createPreviewAssets: true }),
    )
  })

  it('saves and activates question views prepared during creation', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 808 } })
    createExerciseFileUploadMock
      .mockResolvedValueOnce({ data: { r2_key: 'exercise-key', file_type: 'exercise_pdf' } })
      .mockResolvedValueOnce({ data: { r2_key: 'answer-key', file_type: 'solution_pdf' } })
    uploadExerciseFileMock
      .mockResolvedValueOnce({ data: { file_id: 81 } })
      .mockResolvedValueOnce({ data: { file_id: 82 } })
    extractDetailedAnswerKeySchemaMock.mockResolvedValue([
      { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'D', confidence: 1 },
    ])

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<TeacherCreateExercisePage />} />
          <Route path="/teacher/exercises/:id" element={<p>Detail page</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Prepared quiz')
    await user.upload(screen.getByLabelText(/Exercise PDF/i), new File(['exercise'], 'questions.pdf', { type: 'application/pdf' }))
    await user.upload(screen.getByLabelText(/Answer PDF/i), new File(['answer'], 'answers.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))
    expect(await screen.findByText('1 question views are ready to save.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    await waitFor(() => expect(createQuestionAssetSetMock).toHaveBeenCalledWith('test-token', 808, expect.objectContaining({
      source_file_id: 81,
      answer_source_file_id: 82,
      detector_version: 'question-detector-test',
      detection_method: 'text',
    })))
    expect(uploadGeneratedQuestionAssetMock).toHaveBeenCalledWith('test-token', 808, 707, expect.objectContaining({ qId: 1 }))
    expect(updateExerciseMock).toHaveBeenCalledWith('test-token', 808, expect.objectContaining({ question_asset_set_id: 707 }))
    expect(await screen.findByText('Detail page')).toBeInTheDocument()
    expect(questionAssetWorkflowMock).not.toHaveBeenCalled()
  })

  it('inserts manual-review rows when parsed answers skip source question numbers', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 303 } })
    createExerciseFileUploadMock.mockResolvedValue({ data: { r2_key: 'test', file_type: 'exercise_pdf' } })
    uploadExerciseFileMock.mockResolvedValue({ data: {} })
    extractDetailedAnswerKeySchemaMock.mockResolvedValue([
      { q_id: 1, local_number: 1, section_key: 'main', section_title: null, sub_id: null, type: 'mcq', correct_answer: 'A', confidence: 1 },
      { q_id: 3, local_number: 3, section_key: 'main', section_title: null, sub_id: null, type: 'mcq', correct_answer: 'C', confidence: 1 },
    ])

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Gap Quiz')
    await user.upload(screen.getByLabelText(/Exercise PDF/i), new File(['pdf'], 'questions.pdf', { type: 'application/pdf' }))
    await user.upload(screen.getByLabelText(/Answer PDF/i), new File(['answer-pdf'], 'answers.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByLabelText(/correct answer for question 2/i)).toHaveTextContent('—')
    expect(screen.queryByText('Source question numbers must not skip numbers in a section')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))
    expect(screen.getByText('Please fix all answer key errors before saving')).toBeInTheDocument()

    await user.click(screen.getByLabelText(/correct answer for question 2/i))
    await user.click(await screen.findByRole('option', { name: 'B' }))
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))
    expect(screen.getByText('Save with warnings?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', expect.objectContaining({
      schema: expect.arrayContaining([
        expect.objectContaining({ q_id: 1, local_number: 1, correct_answer: 'A' }),
        expect.objectContaining({ q_id: 2, local_number: 2, correct_answer: 'B' }),
        expect.objectContaining({ q_id: 3, local_number: 3, correct_answer: 'C' }),
      ]),
    }))
  })

  it('preserves manual rows after an unsupported-document API rejection', async () => {
    const user = userEvent.setup()
    const error = new Error('No supported answer table could be extracted from the supplied pages. Retry or enter answers manually.')
    error.status = 422
    error.code = 'UNSUPPORTED_DOCUMENT'
    parseExerciseSchemaMock.mockRejectedValue(error)

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'D')
    await user.upload(
      screen.getByLabelText(/Answer PDF/i),
      new File(['pdf'], 'answer.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByText(/Could not find a supported answer table/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/correct answer for question 1/i)).toHaveValue('D')
    expect(screen.getByRole('button', { name: /Read answers from PDF/ })).toBeEnabled()
  })

  it('keeps an unscored Cohere answer populated and marks it for review', async () => {
    const user = userEvent.setup()
    parseExerciseSchemaMock.mockResolvedValue({
      data: {
        schema: [{
          q_id: 1,
          sub_id: null,
          type: 'mcq',
          correct_answer: 'B',
          confidence: null,
        }],
      },
    })

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.upload(
      screen.getByLabelText(/Answer PDF/i),
      new File(['pdf'], 'answer.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByLabelText(/correct answer for question 1/i)).toHaveValue('B')
    expect(screen.getAllByText('Unscored, review required').length).toBeGreaterThan(0)
    expect(screen.getByText(/warnings: 1/i)).toBeInTheDocument()
  })

  it('keeps repeated local numbers from different parsed sections', async () => {
    const user = userEvent.setup()
    parseExerciseSchemaMock.mockResolvedValue({
      data: {
        schema: [
          {
            q_id: 1,
            section_key: 'section-1',
            section_title: 'Phần I',
            local_number: 1,
            sub_id: null,
            type: 'mcq',
            correct_answer: 'A',
            confidence: null,
          },
          {
            q_id: 2,
            section_key: 'section-2',
            section_title: 'Phần II',
            local_number: 1,
            sub_id: null,
            type: 'mcq',
            correct_answer: 'B',
            confidence: null,
          },
        ],
      },
    })

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.upload(
      screen.getByLabelText(/Answer PDF/i),
      new File(['pdf'], 'answer.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect((await screen.findAllByText('Phần I')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Phần II').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Source number for Phần I, 1')).toHaveValue(1)
    expect(screen.getByLabelText('Source number for Phần II, 1')).toHaveValue(1)
  })

  it('adding a boolean row creates 4 sub-question toggles (a,b,c,d)', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await addManualQuestion(user)

    await chooseAnswerType(user, 'True/False')

    // Should now show 4 sub-question toggles labeled a,b,c,d for q_id=1
    expect(screen.getByLabelText(/question 1, part a, true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part a, false/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part b, true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part b, false/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part c, true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part c, false/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part d, true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/question 1, part d, false/i)).toBeInTheDocument()
  })

  it('saves boolean question with sub-questions in schema payload', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 404 } })

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Bool Quiz')

    await addManualQuestion(user)

    await chooseAnswerType(user, 'True/False')

    // Select answers: a=1, b=0, c=1, d=0
    await user.click(screen.getByLabelText(/question 1, part a, true/i))
    await user.click(screen.getByLabelText(/question 1, part b, false/i))
    await user.click(screen.getByLabelText(/question 1, part c, true/i))
    await user.click(screen.getByLabelText(/question 1, part d, false/i))
    await uploadRequiredPdfs(user)

    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', {
      title: 'Bool Quiz',
      is_timed: true,
      duration_minutes: 60,
      max_attempts: 1,
      allow_answer_pdf_download: false,
      schema: [
        { q_id: 1, section_key: 'main', section_title: null, local_number: 1, type: 'boolean', sub_id: 'a', correct_answer: '1', max_score_hundredths: null },
        { q_id: 1, section_key: 'main', section_title: null, local_number: 1, type: 'boolean', sub_id: 'b', correct_answer: '0', max_score_hundredths: null },
        { q_id: 1, section_key: 'main', section_title: null, local_number: 1, type: 'boolean', sub_id: 'c', correct_answer: '1', max_score_hundredths: null },
        { q_id: 1, section_key: 'main', section_title: null, local_number: 1, type: 'boolean', sub_id: 'd', correct_answer: '0', max_score_hundredths: null },
      ],
      grades: [12],
    })
  })

  it('creates an exercise for multiple selected grades', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 405 } })
    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Grade Quiz')
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'A')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Programme access' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Grade 10' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', expect.objectContaining({
      grades: [10, 12],
    }))
  })

  it('blocks save when boolean sub-questions have no answer selected', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Bool Quiz')

    await addManualQuestion(user)
    await chooseAnswerType(user, 'True/False')

    // Don't select any sub-question answers (q_id=1)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText(/please fix all answer key errors/i)).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('renders a drag handle button for each schema row', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await addManualQuestion(user)

    await screen.findByLabelText(/source number for 1/i)
    const handles = screen.getAllByRole('button', { name: /move question/i })
    expect(handles.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('table')).toHaveClass('table-fixed')
  })

  it('freezes the form and links to the created exercise when an upload fails', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 505 } })
    createExerciseFileUploadMock.mockRejectedValue(new Error('Upload setup failed'))

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Upload Quiz')
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'A')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(await screen.findByRole('heading', { name: 'Exercise created, but a file could not be uploaded' })).toBeInTheDocument()
    expect(screen.getByText(/questions\.pdf/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open created exercise' })).toHaveAttribute('href', '/teacher/exercises/505')
    expect(screen.getByRole('link', { name: 'Back to exercises' })).toHaveAttribute('href', '/teacher/exercises')
    expect(screen.queryByRole('button', { name: 'Save Exercise' })).not.toBeInTheDocument()
    expect(createExerciseMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the teacher on creation and starts question generation after both PDF uploads', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 606 } })
    createExerciseFileUploadMock.mockResolvedValue({ data: {
      r2_key: 'exercises/606/questions.pdf',
      file_type: 'exercise_pdf',
      file_name: 'questions.pdf',
    } })
    uploadExerciseFileMock.mockResolvedValue({ data: {} })

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<TeacherCreateExercisePage />} />
          <Route path="/teacher/exercises/:id" element={<p>Detail page</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'PDF Quiz')
    await addManualQuestion(user)
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'A')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(await screen.findByRole('region', { name: 'Question views' })).toHaveTextContent('Question views for Created quiz')
    expect(screen.queryByRole('heading', { name: 'Create Exercise' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open created exercise' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to exercises' })).not.toBeInTheDocument()
    expect(getExerciseMock).toHaveBeenCalledWith(606, 'test-token')
    expect(questionAssetWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({
      token: 'test-token',
      autoStartKey: 1,
      exercise: expect.objectContaining({ id: 606 }),
    }))
  })
})
