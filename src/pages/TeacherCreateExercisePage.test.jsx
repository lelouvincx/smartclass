import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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

async function uploadRequiredPdfs(user) {
  await user.upload(
    screen.getByLabelText(/Exercise PDF — student copy/i),
    new File(['exercise-pdf'], 'questions.pdf', { type: 'application/pdf' }),
  )
  await user.upload(
    screen.getByLabelText(/Answer PDF — teacher copy/i),
    new File(['answer-pdf'], 'answers.pdf', { type: 'application/pdf' }),
  )
}

describe('TeacherCreateExercisePage', () => {
  beforeEach(() => {
    createExerciseMock.mockReset()
    parseExerciseSchemaMock.mockReset()
    createExerciseFileUploadMock.mockReset()
    uploadExerciseFileMock.mockReset()
    extractTextFromPdfMock.mockReset()
    logoutMock.mockReset()
  })

  it('requires separate student and teacher PDFs before saving', async () => {
    const user = userEvent.setup()

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Quiz 1')
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'B')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText('Upload both the student Exercise PDF and teacher Answer PDF.')).toBeInTheDocument()
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
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'B')
    await uploadRequiredPdfs(user)
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
      extract_model: null,
    })
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
    expect(screen.getByLabelText(/duration \(minutes\)/i)).toBeDisabled()
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'C')
    await uploadRequiredPdfs(user)
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
      extract_model: null,
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
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'A')
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

    await user.type(screen.getByLabelText(/exercise title/i), 'Fallback Quiz')
    await user.upload(screen.getByLabelText(/Exercise PDF — student copy/i), new File(['pdf'], 'questions.pdf', { type: 'application/pdf' }))
    await user.upload(screen.getByLabelText(/Answer PDF — teacher copy/i), answerPdf)
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByText('OpenRouter unavailable')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'D')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(createExerciseMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a low-confidence parsed answer blank until the teacher fills it', async () => {
    const user = userEvent.setup()
    extractTextFromPdfMock.mockResolvedValue('Question 1 may be B')
    parseExerciseSchemaMock.mockResolvedValue({
      data: {
        schema: [{
          q_id: 1,
          sub_id: null,
          type: 'mcq',
          correct_answer: 'B',
          confidence: 0.6,
        }],
      },
    })

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.upload(
      screen.getByLabelText(/Answer PDF — teacher copy/i),
      new File(['pdf'], 'answer.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /Read answers from PDF/ }))

    expect(await screen.findByLabelText(/correct answer for question 1/i)).toHaveValue('')
    expect(screen.getByText('60%')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/exercise title/i), 'Needs review')
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText(/please fix all answer key errors/i)).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('adding a boolean row creates 4 sub-question toggles (a,b,c,d)', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    // Change the initial row type to boolean (initial q_id = '1')
    const typeSelect = screen.getByLabelText(/answer type for question 1/i)
    await user.selectOptions(typeSelect, 'boolean')

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

    // Change to boolean type (initial q_id = '1')
    const typeSelect = screen.getByLabelText(/answer type for question 1/i)
    await user.selectOptions(typeSelect, 'boolean')

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
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'c', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'd', correct_answer: '0' },
      ],
      extract_model: null,
    })
  })

  it('blocks save when boolean sub-questions have no answer selected', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'Bool Quiz')

    const typeSelect = screen.getByLabelText(/answer type for question 1/i)
    await user.selectOptions(typeSelect, 'boolean')

    // Don't select any sub-question answers (q_id=1)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(screen.getByText(/please fix all answer key errors/i)).toBeInTheDocument()
    expect(createExerciseMock).not.toHaveBeenCalled()
  })

  it('renders a drag handle button for each schema row', async () => {
    render(
      <MemoryRouter>
        <TeacherCreateExercisePage />
      </MemoryRouter>,
    )

    // Default state: 1 MCQ row → 1 drag handle
    await screen.findByLabelText(/question number 1/i)
    const handles = screen.getAllByRole('button', { name: /move question/i })
    expect(handles.length).toBeGreaterThanOrEqual(1)
  })

  it('freezes the form and links to the created exercise when an upload fails', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 505 } })
    createExerciseFileUploadMock.mockRejectedValue(new Error('Upload setup failed'))

    render(<MemoryRouter><TeacherCreateExercisePage /></MemoryRouter>)

    await user.type(screen.getByLabelText(/exercise title/i), 'Upload Quiz')
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

  it('opens the created exercise and starts question generation after both PDF uploads', async () => {
    const user = userEvent.setup()
    createExerciseMock.mockResolvedValue({ data: { id: 606 } })
    createExerciseFileUploadMock.mockResolvedValue({ data: {
      r2_key: 'exercises/606/questions.pdf',
      file_type: 'exercise_pdf',
      file_name: 'questions.pdf',
    } })
    uploadExerciseFileMock.mockResolvedValue({ data: {} })

    function Destination() {
      const location = useLocation()
      return <p>{`${location.pathname}:${String(location.state?.generateQuestionViews)}`}</p>
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<TeacherCreateExercisePage />} />
          <Route path="/teacher/exercises/:id" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/exercise title/i), 'PDF Quiz')
    await user.type(screen.getByLabelText(/correct answer for question 1/i), 'A')
    await uploadRequiredPdfs(user)
    await user.click(screen.getByRole('button', { name: 'Save Exercise' }))

    expect(await screen.findByText('/teacher/exercises/606:true')).toBeInTheDocument()
  })
})
