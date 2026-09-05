import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherViewExercisePage from './TeacherViewExercisePage'

// --- Mocks ---

const getExerciseMock = vi.fn()
const getQuestionAssetSetMock = vi.fn()
const getExerciseFileBlobMock = vi.fn()
const updateExerciseMock = vi.fn()
const deleteExerciseMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getExercise: (...args) => getExerciseMock(...args),
    getQuestionAssetSet: (...args) => getQuestionAssetSetMock(...args),
    getExerciseFileBlob: (...args) => getExerciseFileBlobMock(...args),
    updateExercise: (...args) => updateExerciseMock(...args),
    deleteExercise: (...args) => deleteExerciseMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'teacher-token' }),
}))

// --- Fixtures ---

const EXERCISE_MCQ = {
  id: 5,
  title: 'Physics Quiz',
  duration_minutes: 45,
  is_timed: 1,
  max_attempts: 1,
  highest_attempt_number: 0,
  question_count: 2,
  updated_at: '2026-03-10 12:00:00',
  is_student_ready: 1,
  grades: [10, 11],
  files: [],
  schema: [
    { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B' },
    { q_id: 2, sub_id: null, type: 'numeric', correct_answer: '42' },
  ],
}

const EXERCISE_WITH_BOOLEAN = {
  id: 6,
  title: 'Biology Quiz',
  duration_minutes: 0,
  is_timed: 0,
  question_count: 2,
  updated_at: '2026-03-11 08:00:00',
  is_student_ready: 0,
  grades: [12],
  files: [
    { id: 1, file_type: 'exercise_pdf', file_name: 'biology.pdf', r2_key: 'ex/1/bio.pdf' },
  ],
  schema: [
    { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'A' },
    { q_id: 2, sub_id: 'a', type: 'boolean', correct_answer: '1' },
    { q_id: 2, sub_id: 'b', type: 'boolean', correct_answer: '0' },
    { q_id: 2, sub_id: 'c', type: 'boolean', correct_answer: '0' },
    { q_id: 2, sub_id: 'd', type: 'boolean', correct_answer: '1' },
  ],
}

// --- Render helper ---

function renderPage(exerciseId = '5') {
  return render(
    <MemoryRouter initialEntries={[`/teacher/exercises/${exerciseId}`]}>
      <Routes>
        <Route path="/teacher/exercises/:id" element={<TeacherViewExercisePage />} />
        <Route path="/teacher/exercises" element={<div>Exercises list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// --- Tests ---

describe('TeacherViewExercisePage', () => {
  beforeEach(() => {
    getExerciseMock.mockReset()
    getQuestionAssetSetMock.mockReset()
    getExerciseFileBlobMock.mockReset()
    updateExerciseMock.mockReset()
    deleteExerciseMock.mockReset()
  })

  // --- Loading & error ---

  it('shows loading state while fetching', () => {
    getExerciseMock.mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error when fetch fails', async () => {
    getExerciseMock.mockRejectedValue(new Error('Not found'))
    renderPage()
    expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  })

  // --- View mode ---

  it('renders exercise title and metadata in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    expect(await screen.findByText('Physics Quiz')).toBeInTheDocument()
    expect(screen.getByText(/timed · 45 min/i)).toBeInTheDocument()
    expect(screen.getByText('Ready for students')).toBeInTheDocument()
    expect(screen.getByText('Grade 10')).toBeInTheDocument()
    expect(screen.getByText('Grade 11')).toBeInTheDocument()
    expect(screen.getByText('1 attempt')).toBeInTheDocument()
  })

  it('renders untimed badge when duration_minutes is 0', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_WITH_BOOLEAN })
    renderPage('6')

    await screen.findByText('Biology Quiz')
    expect(screen.getByText(/untimed/i)).toBeInTheDocument()
    expect(screen.getByText('Preparation required')).toBeInTheDocument()
  })

  it('renders schema rows with correct_answer in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.getByText('B')).toBeInTheDocument()   // MCQ answer
    expect(screen.getByText('42')).toBeInTheDocument()  // numeric answer
    expect(screen.getByText('Number')).toBeInTheDocument()
  })

  it('renders boolean sub-rows with sub_id labels in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_WITH_BOOLEAN })
    renderPage('6')

    await screen.findByText('Biology Quiz')
    // Boolean sub-question rows should show a/b/c/d labels and 0/1 values
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
    expect(screen.getByText('d')).toBeInTheDocument()
    expect(screen.getByText('2 questions')).toBeInTheDocument()
    expect(screen.getByText('True/False')).toBeInTheDocument()
  })

  it('does not duplicate the answer key below a pending question review', async () => {
    getExerciseMock.mockResolvedValue({
      data: { ...EXERCISE_MCQ, pending_question_asset_set_id: 22 },
    })
    getQuestionAssetSetMock.mockImplementation(() => new Promise(() => {}))
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.queryByRole('heading', { name: 'Answer key' })).not.toBeInTheDocument()
  })

  it('loads an uploaded exercise PDF with teacher authentication', async () => {
    const user = userEvent.setup()
    const fileBlob = new Blob(['pdf'], { type: 'application/pdf' })
    const openClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    global.URL.createObjectURL = vi.fn(() => 'blob:exercise-pdf')
    global.URL.revokeObjectURL = vi.fn()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_WITH_BOOLEAN })
    getExerciseFileBlobMock.mockResolvedValue(fileBlob)
    renderPage('6')

    await screen.findByText('Biology Quiz')
    expect(screen.getByText('biology.pdf')).toBeInTheDocument()
    expect(screen.getByText('Exercise PDF')).toHaveClass('bg-sc-primary-container')
    await user.click(screen.getByRole('button', { name: 'View full PDF' }))
    expect(getExerciseFileBlobMock).toHaveBeenCalledWith(1, 'teacher-token')
    expect(openClick).toHaveBeenCalledTimes(1)
    openClick.mockRestore()
  })

  it('does not expose the default image-extraction model', async () => {
    getExerciseMock.mockResolvedValue({ data: { ...EXERCISE_MCQ, extract_model: 'provider/private-model-id' } })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.queryByText(/answer reading/i)).not.toBeInTheDocument()
    expect(screen.queryByText('provider/private-model-id')).not.toBeInTheDocument()
  })

  it('shows "No files uploaded" when files array is empty', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.getByText(/no files uploaded/i)).toBeInTheDocument()
  })

  it('has a Back to Exercises link', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.getByRole('link', { name: /back to exercises/i })).toBeInTheDocument()
  })

  // --- Edit mode toggle ---

  it('shows Edit button in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('switches to edit mode when Edit button is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    // Title should become an input
    expect(screen.getByLabelText('Exercise title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grade access' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/image-extraction model/i)).not.toBeInTheDocument()
    // Save and Cancel buttons should appear
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('returns to view mode when Cancel is clicked without calling API', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText('Exercise title')).not.toBeInTheDocument()
    expect(screen.getByText('Physics Quiz')).toBeInTheDocument()
    expect(updateExerciseMock).not.toHaveBeenCalled()
  })

  // --- Edit mode: save ---

  it('calls updateExercise with updated title on save', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    updateExerciseMock.mockResolvedValue({ data: { ...EXERCISE_MCQ, title: 'Updated Quiz' } })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    const titleInput = screen.getByLabelText('Exercise title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Updated Quiz')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateExerciseMock).toHaveBeenCalledWith(
      'teacher-token',
      5,
      expect.objectContaining({ title: 'Updated Quiz' }),
    )
  })

  it('updates the exercise grade memberships', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    updateExerciseMock.mockResolvedValue({ data: { ...EXERCISE_MCQ, grades: [10, 11, 12] } })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await user.click(screen.getByRole('button', { name: 'Grade access' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Grade 12' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateExerciseMock).toHaveBeenCalledWith(
      'teacher-token',
      5,
      expect.objectContaining({ grades: [10, 11, 12] }),
    )
  })

  it('updates the exercise to unlimited attempts', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    updateExerciseMock.mockResolvedValue({ data: { ...EXERCISE_MCQ, max_attempts: null } })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await user.click(screen.getByRole('radio', { name: 'Unlimited' }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateExerciseMock).toHaveBeenCalledWith(
      'teacher-token',
      5,
      expect.objectContaining({ max_attempts: null }),
    )
    expect(await screen.findByText('Unlimited attempts')).toBeInTheDocument()
  })

  it('warns before lowering a limit below attempts students already started', async () => {
    const user = userEvent.setup()
    const exercise = { ...EXERCISE_MCQ, max_attempts: 3, highest_attempt_number: 2 }
    getExerciseMock.mockResolvedValue({ data: exercise })
    updateExerciseMock.mockResolvedValue({ data: { ...exercise, max_attempts: 1 } })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await user.clear(screen.getByLabelText('Maximum attempts'))
    await user.type(screen.getByLabelText('Maximum attempts'), '1')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateExerciseMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /lower attempt limit/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /lower limit/i }))
    expect(updateExerciseMock).toHaveBeenCalledWith(
      'teacher-token',
      5,
      expect.objectContaining({ max_attempts: 1 }),
    )
  })

  it('returns to view mode with updated data after successful save', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    updateExerciseMock.mockResolvedValue({ data: { ...EXERCISE_MCQ, title: 'Renamed Quiz' } })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))

    const titleInput = screen.getByLabelText('Exercise title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Renamed Quiz')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Renamed Quiz')).toBeInTheDocument()
    expect(screen.queryByLabelText('Exercise title')).not.toBeInTheDocument()
  })

  it('shows error message when save fails', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    updateExerciseMock.mockRejectedValue(new Error('Update failed'))
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/update failed/i)).toBeInTheDocument()
  })

  // --- Delete ---

  it('shows Delete button in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('shows confirmation dialog when Delete is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/delete this exercise/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('dismisses confirmation dialog when Cancel is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog', { name: /delete exercise/i })).not.toBeInTheDocument()
    expect(deleteExerciseMock).not.toHaveBeenCalled()
  })

  it('calls deleteExercise and navigates to list on confirm', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    deleteExerciseMock.mockResolvedValue({ data: { deleted: true } })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /delete/i }))

    // Confirm button disabled until DELETE is typed
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/type.*delete.*to confirm/i), 'DELETE')
    expect(screen.getByRole('button', { name: /yes, delete/i })).not.toBeDisabled()

    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    expect(deleteExerciseMock).toHaveBeenCalledWith('teacher-token', 5)
    expect(await screen.findByText('Exercises list')).toBeInTheDocument()
  })

  it('confirm button stays disabled when wrong text is typed', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.type(screen.getByLabelText(/type.*delete.*to confirm/i), 'delete')

    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeDisabled()
    expect(deleteExerciseMock).not.toHaveBeenCalled()
  })

  it('shows drag handles for each schema row in edit mode', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    await user.click(screen.getByRole('button', { name: /edit/i }))

    const handles = screen.getAllByRole('button', { name: /move question/i })
    // EXERCISE_MCQ has 2 rows (q_id 1 and 2)
    expect(handles).toHaveLength(2)
  })
})
