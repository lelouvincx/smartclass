import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import QuestionAssetWorkflow from './question-asset-workflow'

const api = vi.hoisted(() => ({
  createQuestionAssetSet: vi.fn(),
  deleteQuestionAssetSet: vi.fn(),
  getExerciseFileBlob: vi.fn(),
  getQuestionAssetBlob: vi.fn(),
  getQuestionAssetSet: vi.fn(),
  parseExerciseSchema: vi.fn(),
  rejectQuestionAsset: vi.fn(),
  replaceQuestionAssetsWithGenerated: vi.fn(),
  replaceQuestionAssetWithScreenshot: vi.fn(),
  updateExercise: vi.fn(),
  uploadAnswerCandidates: vi.fn(),
  uploadGeneratedQuestionAsset: vi.fn(),
}))
const generateQuestionAssetsMock = vi.hoisted(() => vi.fn())
const extractTextFromPdfMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/api', () => api)
vi.mock('../lib/question-generation', () => ({
  generateQuestionAssets: (...args) => generateQuestionAssetsMock(...args),
}))
vi.mock('../lib/pdf', () => ({
  extractTextFromPdf: (...args) => extractTextFromPdfMock(...args),
}))

const EXERCISE = {
  id: 9,
  title: 'Exercise 9',
  pending_question_asset_set_id: null,
  question_asset_set_id: null,
  question_assets: [],
  files: [
    { id: 91, file_type: 'exercise_pdf', file_name: 'exercise-9.pdf' },
    { id: 92, file_type: 'solution_pdf', file_name: 'answers.pdf' },
  ],
  schema: [
    { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'A' },
    { q_id: 2, sub_id: null, type: 'numeric', correct_answer: '42' },
  ],
}

const QUESTION_DESCRIPTORS = [
  { q_id: 1, section_key: 'main', section_title: null, local_number: 1 },
  { q_id: 2, section_key: 'main', section_title: null, local_number: 2 },
]

const generatedAsset = qId => ({
  qId,
  segmentIndex: 0,
  sourcePage: 1,
  x: 0.05,
  y: 0.1,
  width: 0.9,
  height: 0.2,
  accessibleText: `Question ${qId}`,
  confidence: 0.8,
  blob: new Blob(['webp'], { type: 'image/webp' }),
  pixelWidth: 1000,
  pixelHeight: 300,
  fileName: `question-${qId}.webp`,
})

const storedAsset = (qId, overrides = {}) => ({
  id: 100 + qId,
  asset_set_id: 22,
  q_id: qId,
  segment_index: 0,
  source_kind: 'pdf_crop',
  accessible_text: `Question ${qId}`,
  confidence: 0.8,
  rejected_at: null,
  file_url: `/api/question-assets/${100 + qId}`,
  ...overrides,
})

const storedCandidate = (qId, sourceKind, proposedAnswer, overrides = {}) => ({
  id: Math.floor(Math.random() * 100000),
  asset_set_id: 22,
  q_id: qId,
  sub_id: null,
  type: qId === 2 ? 'numeric' : 'mcq',
  proposed_answer: proposedAnswer,
  source_kind: sourceKind,
  source_file_id: ['answer_pdf_text', 'answer_pdf_green_highlight'].includes(sourceKind) ? 92 : 91,
  source_page: sourceKind === 'answer_pdf_green_highlight' ? 1 : null,
  confidence: 0.9,
  ...overrides,
})

function preview(
  assets = [storedAsset(1), storedAsset(2)],
  {
    setId = 22,
    sourceFileId = 91,
    answerSourceFileId = 92,
    answerParserStatus = 'parsed',
    answerCandidates = [],
  } = {},
) {
  return {
    data: {
      asset_set: {
        id: setId,
        exercise_id: 9,
        source_file_id: sourceFileId,
        answer_source_file_id: answerSourceFileId,
        answer_parser_status: answerParserStatus,
        confirmed_at: null,
      },
      assets,
      answer_candidates: answerCandidates,
    },
  }
}

function renderWorkflow(exercise = EXERCISE, props = {}) {
  return render(
    <QuestionAssetWorkflow
      exercise={exercise}
      token="teacher-token"
      onActivated={vi.fn()}
      onReplacePdf={vi.fn()}
      {...props}
    />,
  )
}

describe('QuestionAssetWorkflow', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    generateQuestionAssetsMock.mockReset()
    extractTextFromPdfMock.mockReset()
    api.getQuestionAssetBlob.mockResolvedValue(new Blob(['image'], { type: 'image/webp' }))
    api.uploadAnswerCandidates.mockResolvedValue({ data: [] })
    global.URL.createObjectURL = vi.fn(() => 'blob:question-preview')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('explains that vision fallback is disabled when no source PDF exists', () => {
    renderWorkflow({ ...EXERCISE, files: [] })

    expect(screen.getByText('Add an exercise PDF before generating question views.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare exercise' })).toBeDisabled()
  })

  it('requires a separate Answer PDF before preparing student question views', () => {
    renderWorkflow({
      ...EXERCISE,
      files: EXERCISE.files.filter(file => file.file_type === 'exercise_pdf'),
    })

    expect(screen.getByText('Add the teacher Answer PDF before preparing this exercise.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare exercise' })).toBeDisabled()
  })

  it('detects, renders, uploads, and displays the complete pending preview', async () => {
    const user = userEvent.setup()
    api.getExerciseFileBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    generateQuestionAssetsMock.mockResolvedValue({
      detectorVersion: 'text-geometry-v1',
      detectionMethod: 'text',
      warnings: [],
      assets: [generatedAsset(1), generatedAsset(2)],
    })
    api.createQuestionAssetSet.mockResolvedValue({ data: { id: 22 } })
    api.uploadGeneratedQuestionAsset.mockResolvedValue({ data: {} })
    api.getQuestionAssetSet.mockResolvedValue(preview())

    renderWorkflow()
    await user.click(screen.getByRole('button', { name: 'Prepare exercise' }))

    expect(generateQuestionAssetsMock).toHaveBeenCalledWith(
      expect.any(Blob),
      QUESTION_DESCRIPTORS,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(api.createQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, {
      source_file_id: 91,
      answer_source_file_id: 92,
      answer_parser_status: 'failed',
      detector_version: 'text-geometry-v1',
      detection_method: 'text',
    })
    expect(api.uploadGeneratedQuestionAsset).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'Review every question' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /Question [12]/ })).toHaveLength(2)
    expect(screen.queryByText('Accessible text')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeEnabled()
    expect(screen.getByText('Final safety check').closest('[data-slot="card"]')).not.toHaveClass('sm:sticky')
    expect(screen.getByText('Final safety check').closest('[data-slot="card"]')).not.toHaveClass('sticky')
  })

  it('reviews each question image and its matching answer in the same card', async () => {
    api.getQuestionAssetSet.mockResolvedValue(preview(undefined, {
      answerCandidates: [storedCandidate(1, 'answer_pdf_text', 'A')],
    }))

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })

    const questionOneHeading = await screen.findByRole('heading', { name: 'Question 1' })
    const questionOneCard = questionOneHeading.closest('[data-slot="card"]')
    const questionTwoCard = screen.getByRole('heading', { name: 'Question 2' }).closest('[data-slot="card"]')

    await waitFor(() => expect(questionOneCard.querySelector('img')).toBeInTheDocument())
    const questionOneAnswer = within(questionOneCard).getByLabelText('Correct answer for question 1')
    expect(questionOneAnswer).toHaveAttribute('data-slot', 'select-trigger')
    expect(questionOneAnswer).toHaveTextContent('A')
    expect(within(questionOneCard).getByText('Answer PDF: A')).toBeInTheDocument()
    expect(within(questionOneCard).queryByText(/confidence/i)).not.toBeInTheDocument()
    expect(within(questionOneCard).queryByText('From Answer PDF')).not.toBeInTheDocument()
    expect(within(questionOneCard).queryByLabelText('Correct answer for question 2')).not.toBeInTheDocument()
    expect(within(questionTwoCard).getByLabelText('Correct answer for question 2')).toHaveValue('42')
    expect(screen.queryByRole('heading', { name: 'Review the answer key' })).not.toBeInTheDocument()
  })

  it('prepares Answer PDF and green-highlight candidates in the same generation flow', async () => {
    const user = userEvent.setup()
    const exercise = {
      ...EXERCISE,
      files: [
        ...EXERCISE.files,
        { id: 92, file_type: 'solution_pdf', file_name: 'answers.pdf' },
      ],
    }
    api.getExerciseFileBlob.mockImplementation(fileId => Promise.resolve(
      new Blob([fileId === 92 ? 'answer pdf' : 'exercise pdf'], { type: 'application/pdf' }),
    ))
    extractTextFromPdfMock.mockResolvedValue('Question 1 B. Question 2 42.')
    api.parseExerciseSchema.mockResolvedValue({
      data: {
        schema: [
          { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'A', confidence: 0.91 },
          { q_id: 2, sub_id: null, type: 'numeric', correct_answer: '42', confidence: 0.6 },
        ],
      },
    })
    generateQuestionAssetsMock
      .mockResolvedValueOnce({
        detectorVersion: 'text-geometry-v1',
        detectionMethod: 'text',
        warnings: [],
        answerCandidates: [],
        assets: [generatedAsset(1), generatedAsset(2)],
      })
      .mockResolvedValueOnce({
        detectorVersion: 'text-geometry-v1',
        detectionMethod: 'text',
        warnings: [],
        answerCandidates: [{
          qId: 1,
          subId: null,
          type: 'mcq',
          proposedAnswer: 'A',
          sourcePage: 1,
          sourceX: 0.1,
          sourceY: 0.2,
          sourceWidth: 0.3,
          sourceHeight: 0.04,
          confidence: 1,
        }],
        assets: [],
      })
    api.createQuestionAssetSet.mockResolvedValue({ data: { id: 22 } })
    api.uploadGeneratedQuestionAsset.mockResolvedValue({ data: {} })
    api.getQuestionAssetSet.mockResolvedValue(preview(undefined, {
      answerSourceFileId: 92,
      answerParserStatus: 'parsed',
      answerCandidates: [
        storedCandidate(1, 'answer_pdf_text', 'A'),
        storedCandidate(1, 'answer_pdf_green_highlight', 'A'),
      ],
    }))

    renderWorkflow(exercise)
    await user.click(screen.getByRole('button', { name: 'Prepare exercise' }))

    expect(api.parseExerciseSchema).toHaveBeenCalledWith('teacher-token', {
      source_text: 'Question 1 B. Question 2 42.',
      expected_question_count: 2,
    })
    expect(generateQuestionAssetsMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Blob),
      QUESTION_DESCRIPTORS,
      expect.objectContaining({ schemaRows: EXERCISE.schema }),
    )
    expect(generateQuestionAssetsMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Blob),
      QUESTION_DESCRIPTORS,
      expect.objectContaining({
        createAssets: false,
        schemaRows: EXERCISE.schema,
      }),
    )
    expect(api.createQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, expect.objectContaining({
      answer_source_file_id: 92,
      answer_parser_status: 'parsed',
    }))
    expect(api.uploadAnswerCandidates).toHaveBeenCalledWith(
      'teacher-token',
      9,
      22,
      expect.arrayContaining([
        expect.objectContaining({ source_kind: 'answer_pdf_text', proposed_answer: 'A' }),
        expect.objectContaining({
          source_kind: 'answer_pdf_green_highlight',
          source_file_id: 92,
          proposed_answer: 'A',
        }),
      ]),
    )
    expect(api.uploadAnswerCandidates.mock.calls[0][3]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        q_id: 2,
        source_kind: 'answer_pdf_text',
      }),
    ]))
    expect(await screen.findByText('Answer PDF: A')).toBeInTheDocument()
    expect(screen.getByText('Green highlight: A')).toBeInTheDocument()
    expect(screen.queryByText('Sources agree')).not.toBeInTheDocument()
    expect(screen.queryByText('From green highlight')).not.toBeInTheDocument()
  })

  it('keeps an existing teacher answer when the Answer PDF proposes a different value', async () => {
    const user = userEvent.setup()
    const exercise = {
      ...EXERCISE,
      files: [
        ...EXERCISE.files,
        { id: 92, file_type: 'solution_pdf', file_name: 'answers.pdf' },
      ],
    }
    api.getExerciseFileBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    extractTextFromPdfMock.mockResolvedValue('Question 1 B. Question 2 42.')
    api.parseExerciseSchema.mockResolvedValue({
      data: {
        schema: [
          { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B', confidence: 0.91 },
          { q_id: 2, sub_id: null, type: 'numeric', correct_answer: '42', confidence: 0.88 },
        ],
      },
    })
    generateQuestionAssetsMock.mockResolvedValue({
      detectorVersion: 'text-geometry-v1',
      detectionMethod: 'text',
      warnings: [],
      answerCandidates: [],
      assets: [generatedAsset(1), generatedAsset(2)],
    })
    api.createQuestionAssetSet.mockResolvedValue({ data: { id: 22 } })
    api.uploadGeneratedQuestionAsset.mockResolvedValue({ data: {} })
    api.getQuestionAssetSet.mockResolvedValue(preview(undefined, {
      answerSourceFileId: 92,
      answerParserStatus: 'parsed',
      answerCandidates: [
        storedCandidate(1, 'answer_pdf_text', 'B'),
        storedCandidate(2, 'answer_pdf_text', '42'),
      ],
    }))

    renderWorkflow(exercise)
    await user.click(screen.getByRole('button', { name: 'Prepare exercise' }))

    expect(await screen.findByText('Conflict')).toBeInTheDocument()
    expect(screen.getByLabelText('Correct answer for question 1')).toHaveTextContent('A')
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeDisabled()
  })

  it('cleans up a newly created partial set when an initial upload fails', async () => {
    const user = userEvent.setup()
    api.getExerciseFileBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    generateQuestionAssetsMock.mockResolvedValue({
      detectorVersion: 'text-geometry-v1',
      detectionMethod: 'text',
      warnings: [],
      assets: [generatedAsset(1), generatedAsset(2)],
    })
    api.createQuestionAssetSet.mockResolvedValue({ data: { id: 22 } })
    api.uploadGeneratedQuestionAsset.mockRejectedValue(new Error('Upload interrupted'))
    api.deleteQuestionAssetSet.mockResolvedValue({ data: { deleted: true } })

    renderWorkflow()
    await user.click(screen.getByRole('button', { name: 'Prepare exercise' }))

    expect(await screen.findByText('Upload interrupted')).toBeInTheDocument()
    expect(api.deleteQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, 22)
    expect(api.getQuestionAssetSet).not.toHaveBeenCalled()
  })

  it('restores the latest pending preview after a reload', async () => {
    api.getQuestionAssetSet.mockResolvedValue(preview())

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })

    expect(await screen.findByRole('heading', { name: 'Review every question' })).toBeInTheDocument()
    expect(api.getQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, 22)
  })

  it('replaces an old pending preview immediately after the exercise PDF changes', async () => {
    api.getExerciseFileBlob.mockResolvedValue(new Blob(['new pdf'], { type: 'application/pdf' }))
    generateQuestionAssetsMock.mockImplementation(async () => {
      expect(screen.queryByRole('heading', { name: 'Review every question' })).not.toBeInTheDocument()
      return {
        detectorVersion: 'text-geometry-v1',
        detectionMethod: 'text',
        warnings: [],
        assets: [generatedAsset(1), generatedAsset(2)],
      }
    })
    api.createQuestionAssetSet.mockResolvedValue({ data: { id: 23 } })
    api.uploadGeneratedQuestionAsset.mockResolvedValue({ data: {} })
    api.deleteQuestionAssetSet.mockResolvedValue({ data: { deleted: true } })
    api.getQuestionAssetSet.mockResolvedValue(preview(undefined, { setId: 23, sourceFileId: 93 }))

    renderWorkflow({
      ...EXERCISE,
      pending_question_asset_set_id: 22,
      files: [
        { id: 93, file_type: 'exercise_pdf', file_name: 'replacement.pdf' },
        { id: 92, file_type: 'solution_pdf', file_name: 'answers.pdf' },
      ],
    }, { autoStartKey: 1 })

    expect(await screen.findByRole('heading', { name: 'Review every question' })).toBeInTheDocument()
    expect(api.getQuestionAssetSet).toHaveBeenCalledTimes(1)
    expect(api.getQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, 23)
    expect(api.deleteQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, 22)
  })

  it('offers direct regeneration when a saved preview uses an older PDF', async () => {
    const user = userEvent.setup()
    api.getQuestionAssetSet
      .mockResolvedValueOnce(preview(undefined, { sourceFileId: 90 }))
      .mockResolvedValueOnce(preview(undefined, { setId: 23, sourceFileId: 91 }))
    api.getExerciseFileBlob.mockResolvedValue(new Blob(['current pdf'], { type: 'application/pdf' }))
    generateQuestionAssetsMock.mockResolvedValue({
      detectorVersion: 'text-geometry-v1',
      detectionMethod: 'text',
      warnings: [],
      assets: [generatedAsset(1), generatedAsset(2)],
    })
    api.createQuestionAssetSet.mockResolvedValue({ data: { id: 23 } })
    api.uploadGeneratedQuestionAsset.mockResolvedValue({ data: {} })
    api.deleteQuestionAssetSet.mockResolvedValue({ data: { deleted: true } })

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })
    await user.click(await screen.findByRole('button', { name: 'Generate new preview' }))

    expect(await screen.findByRole('heading', { name: 'Review every question' })).toBeInTheDocument()
    expect(api.createQuestionAssetSet).toHaveBeenCalledTimes(1)
    expect(api.deleteQuestionAssetSet).toHaveBeenCalledWith('teacher-token', 9, 22)
  })

  it('blocks activation and exposes recovery actions for a rejected question', async () => {
    api.getQuestionAssetSet.mockResolvedValue(preview([
      storedAsset(1, { rejected_at: '2026-09-03T12:00:00.000Z' }),
      storedAsset(2),
    ]))
    const onReplacePdf = vi.fn()

    renderWorkflow(
      { ...EXERCISE, pending_question_asset_set_id: 22 },
      { onReplacePdf },
    )

    expect(await screen.findByText('Replacement required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry detection' })).toBeInTheDocument()
    expect(screen.getByText('Upload question screenshot')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Replace exercise PDF' }))
    expect(onReplacePdf).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeDisabled()
  })

  it('uploads a screenshot for only the rejected question without requiring extracted text', async () => {
    const user = userEvent.setup()
    api.getQuestionAssetSet
      .mockResolvedValueOnce(preview([
        storedAsset(1, { rejected_at: '2026-09-03T12:00:00.000Z' }),
        storedAsset(2),
      ]))
      .mockResolvedValueOnce(preview([
        storedAsset(1, { source_kind: 'teacher_screenshot', confidence: null }),
        storedAsset(2),
      ]))
    api.replaceQuestionAssetWithScreenshot.mockResolvedValue({ data: {} })

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })
    await screen.findByText('Replacement required')
    await user.upload(
      screen.getByLabelText('Screenshot for question 1'),
      new File(['png'], 'question-1.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: 'Use this screenshot' }))

    expect(api.replaceQuestionAssetWithScreenshot).toHaveBeenCalledWith(
      'teacher-token',
      9,
      22,
      1,
      expect.any(File),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    await waitFor(() => expect(screen.queryByText('Replacement required')).not.toBeInTheDocument())
  })

  it('retries detection for only the rejected question in the same pending set', async () => {
    const user = userEvent.setup()
    api.getQuestionAssetSet
      .mockResolvedValueOnce(preview([
        storedAsset(1, { rejected_at: '2026-09-03T12:00:00.000Z' }),
        storedAsset(2),
      ]))
      .mockResolvedValueOnce(preview([
        storedAsset(1, { accessible_text: 'Retried question 1' }),
        storedAsset(2),
      ]))
    api.getExerciseFileBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    generateQuestionAssetsMock.mockResolvedValue({
      detectorVersion: 'text-geometry-v1',
      detectionMethod: 'text',
      warnings: [],
      assets: [generatedAsset(1)],
    })
    api.replaceQuestionAssetsWithGenerated.mockResolvedValue({ data: {} })

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })
    await user.click(await screen.findByRole('button', { name: 'Retry detection' }))

    expect(generateQuestionAssetsMock).toHaveBeenCalledWith(
      expect.any(Blob),
      QUESTION_DESCRIPTORS,
      expect.objectContaining({
        onProgress: expect.any(Function),
        questionIdsToRender: [1],
      }),
    )
    expect(api.replaceQuestionAssetsWithGenerated).toHaveBeenCalledWith(
      'teacher-token',
      9,
      22,
      1,
      [expect.objectContaining({ qId: 1 })],
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(api.deleteQuestionAssetSet).not.toHaveBeenCalled()
    expect(api.createQuestionAssetSet).not.toHaveBeenCalled()
    expect(api.uploadGeneratedQuestionAsset).not.toHaveBeenCalled()
    expect(await screen.findAllByRole('button', { name: 'Reject question preview' })).toHaveLength(2)
    expect(screen.queryByText('Replacement required')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Question 2' })).toBeInTheDocument()
  })

  it('activates only a complete, current, non-rejected preview', async () => {
    const user = userEvent.setup()
    const onActivated = vi.fn()
    api.getQuestionAssetSet.mockResolvedValue(preview())
    api.updateExercise.mockResolvedValue({ data: { ...EXERCISE, question_asset_set_id: 22 } })

    renderWorkflow(
      { ...EXERCISE, pending_question_asset_set_id: 22 },
      { onActivated },
    )
    await user.click(await screen.findByRole('button', { name: 'Confirm answers and activate' }))

    expect(screen.getByRole('dialog', { name: 'Final safety check' })).toBeInTheDocument()
    expect(screen.getByText(/Confirm that every answer is correct/)).toBeInTheDocument()
    expect(api.updateExercise).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm and activate' }))

    expect(api.updateExercise).toHaveBeenCalledWith('teacher-token', 9, {
      schema: EXERCISE.schema,
      question_asset_set_id: 22,
    })
    expect(onActivated).toHaveBeenCalledWith(expect.objectContaining({ question_asset_set_id: 22 }))
  })

  it('shows conflicting answer sources and requires an explicit teacher resolution', async () => {
    const user = userEvent.setup()
    api.getQuestionAssetSet.mockResolvedValue(preview(undefined, {
      answerSourceFileId: 92,
      answerParserStatus: 'parsed',
      answerCandidates: [
        storedCandidate(1, 'answer_pdf_text', 'B'),
        storedCandidate(1, 'answer_pdf_green_highlight', 'C'),
      ],
    }))
    api.updateExercise.mockResolvedValue({ data: { ...EXERCISE, question_asset_set_id: 22 } })
    const exercise = {
      ...EXERCISE,
      pending_question_asset_set_id: 22,
      files: [
        ...EXERCISE.files,
        { id: 92, file_type: 'solution_pdf', file_name: 'answers.pdf' },
      ],
    }

    renderWorkflow(exercise)

    expect(await screen.findByText('Conflict')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeDisabled()

    const resolveConflict = screen.getByRole('button', { name: 'Keep current answer for question 1' })
    expect(resolveConflict).toHaveClass('w-full', 'whitespace-normal')
    await user.click(resolveConflict)
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Confirm answers and activate' }))
    await user.click(screen.getByRole('button', { name: 'Confirm and activate' }))

    expect(api.updateExercise).toHaveBeenCalledWith('teacher-token', 9, {
      schema: EXERCISE.schema,
      question_asset_set_id: 22,
      resolved_answer_candidate_keys: [{ q_id: 1, sub_id: null }],
    })
  })

  it('keeps low-confidence generated questions from activating', async () => {
    api.getQuestionAssetSet.mockResolvedValue(preview([
      storedAsset(1, { confidence: 0.5 }),
      storedAsset(2),
    ]))

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })

    const outline = await screen.findByRole('navigation', { name: 'Check these questions' })
    expect(within(outline).getByText('1 question needs attention before activation.')).toBeInTheDocument()
    expect(within(outline).getByRole('link', { name: 'Question 1' })).toHaveAttribute(
      'href',
      '#question-review-1',
    )
    expect(screen.getByRole('heading', { name: 'Question 1' }).closest('[data-slot="card"]')).toHaveAttribute(
      'id',
      'question-review-1',
    )
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeDisabled()
  })

  it('links a blank final answer from the attention outline and explains how to resolve it', async () => {
    api.getQuestionAssetSet.mockResolvedValue(preview())
    const exercise = {
      ...EXERCISE,
      pending_question_asset_set_id: 22,
      schema: [
        { ...EXERCISE.schema[0], correct_answer: '' },
        EXERCISE.schema[1],
      ],
    }

    renderWorkflow(exercise)

    const outline = await screen.findByRole('navigation', { name: 'Check these questions' })
    expect(within(outline).getByRole('link', { name: 'Question 1' })).toHaveAttribute(
      'href',
      '#question-review-1',
    )
    const questionOneCard = screen.getByRole('heading', { name: 'Question 1' }).closest('[data-slot="card"]')
    expect(within(questionOneCard).getByText('Needs attention')).toBeInTheDocument()
    expect(within(questionOneCard).getByText('Select or enter a valid final answer.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm answers and activate' })).toBeDisabled()
  })

  it('uses a destructive reject action', async () => {
    api.getQuestionAssetSet.mockResolvedValue(preview())

    renderWorkflow({ ...EXERCISE, pending_question_asset_set_id: 22 })

    const reject = (await screen.findAllByRole('button', { name: 'Reject question preview' }))[0]
    expect(reject).toHaveAttribute('data-variant', 'destructive')
  })
})
