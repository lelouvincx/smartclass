import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherCreateExercisePage from './TeacherCreateExercisePage'

const createExerciseMock = vi.fn()
const parseExerciseSchemaMock = vi.fn()
const createExerciseFileUploadMock = vi.fn()
const uploadExerciseFileMock = vi.fn()
const extractTextFromPdfMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createExercise: (...args) => createExerciseMock(...args),
    parseExerciseSchema: (...args) => parseExerciseSchemaMock(...args),
    createExerciseFileUpload: (...args) => createExerciseFileUploadMock(...args),
    uploadExerciseFile: (...args) => uploadExerciseFileMock(...args),
  }
})

vi.mock('../lib/pdf', () => ({
  extractTextFromPdf: (...args) => extractTextFromPdfMock(...args),
}))

const logoutMock = vi.fn()

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
    logout: logoutMock,
  }),
}))

describe('TeacherCreateExercisePage', () => {
  beforeEach(() => {
    createExerciseMock.mockReset()
    parseExerciseSchemaMock.mockReset()
    createExerciseFileUploadMock.mockReset()
    uploadExerciseFileMock.mockReset()
    extractTextFromPdfMock.mockReset()
    logoutMock.mockReset()
  })

  it('allows manual MCQ schema save without answer pdf', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 101 } })

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Exercise title'), 'Quiz 1')
    await user.type(screen.getByLabelText(/answer-/), 'B')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', {
      title: 'Quiz 1',
      is_timed: true,
      duration_minutes: 60,
      schema: [
        {
          q_id: 1,
          type: 'mcq',
          correct_answer: 'B',
        },
      ],
    })
  })

  it('keeps generate button disabled when answer pdf is missing', () => {
    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /Generate Schema/ })).toBeDisabled()
  })

  it('saves untimed exercise without duration value', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 202 } })

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Exercise title'), 'Untimed Quiz')
    await user.click(screen.getByLabelText('Timed mode toggle'))
    expect(screen.getByLabelText('Duration (minutes)')).toBeDisabled()
    await user.type(screen.getByLabelText(/answer-/), 'C')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', {
      title: 'Untimed Quiz',
      is_timed: false,
      duration_minutes: 0,
      schema: [
        {
          q_id: 1,
          type: 'mcq',
          correct_answer: 'C',
        },
      ],
    })
  })

  it('blocks save when timed mode duration is empty', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Exercise title'), 'Timed Quiz')
    await user.clear(screen.getByLabelText('Duration (minutes)'))
    await user.type(screen.getByLabelText(/answer-/), 'A')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText('Duration must be a positive number')).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('shows parse failure and still allows manual save', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 303 } })
    extractTextFromPdfMock.mockResolvedValue('Q1 A Q2 TRUE Q3 42')
    parseExerciseSchemaMock.mockRejectedValue(new Error('OpenRouter unavailable'))

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    const answerPdf = new File(['fake-pdf'], 'answer.pdf', { type: 'application/pdf' })

    await user.type(screen.getByLabelText('Exercise title'), 'Fallback Quiz')
    await user.upload(screen.getByLabelText('Answer PDF (recommended)'), answerPdf)
    await user.click(screen.getByRole('button', { name: /Generate Schema/ }))

    expect(await screen.findByText('OpenRouter unavailable')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/answer-/), 'D')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledTimes(1)
  })

  it('adding a boolean row creates 4 sub-question toggles (a,b,c,d)', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    // Change the initial row type to boolean (initial q_id = '1')
    const typeSelect = screen.getByLabelText(/type-/)
    await user.selectOptions(typeSelect, 'boolean')

    // Should now show 4 sub-question toggles labeled a,b,c,d for q_id=1
    expect(screen.getByLabelText(/sub-q 1 a true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 a false/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 b true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 b false/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 c true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 c false/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 d true/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sub-q 1 d false/i)).toBeInTheDocument()
  })

  it('saves boolean question with sub-questions in schema payload', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 404 } })

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Exercise title'), 'Bool Quiz')

    // Change to boolean type (initial q_id = '1')
    const typeSelect = screen.getByLabelText(/type-/)
    await user.selectOptions(typeSelect, 'boolean')

    // Select answers: a=1, b=0, c=1, d=0
    await user.click(screen.getByLabelText(/sub-q 1 a true/i))
    await user.click(screen.getByLabelText(/sub-q 1 b false/i))
    await user.click(screen.getByLabelText(/sub-q 1 c true/i))
    await user.click(screen.getByLabelText(/sub-q 1 d false/i))

    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledWith('test-token', {
      title: 'Bool Quiz',
      is_timed: true,
      duration_minutes: 60,
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'c', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'd', correct_answer: '0' },
      ],
    })
  })

  it('blocks save when boolean sub-questions have no answer selected', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Exercise title'), 'Bool Quiz')

    const typeSelect = screen.getByLabelText(/type-/)
    await user.selectOptions(typeSelect, 'boolean')

    // Don't select any sub-question answers (q_id=1)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText(/please fix all schema errors/i)).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })
})
