import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherViewExercisePage from './TeacherViewExercisePage'

// --- Mocks ---

const getExerciseMock = vi.fn()
const updateExerciseMock = vi.fn()
const deleteExerciseMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getExercise: (...args) => getExerciseMock(...args),
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
  question_count: 2,
  updated_at: '2026-03-10 12:00:00',
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
  })

  it('renders untimed badge when duration_minutes is 0', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_WITH_BOOLEAN })
    renderPage('6')

    await screen.findByText('Biology Quiz')
    expect(screen.getByText(/untimed/i)).toBeInTheDocument()
  })

  it('renders schema rows with correct_answer in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    renderPage()

    await screen.findByText('Physics Quiz')
    expect(screen.getByText('B')).toBeInTheDocument()   // MCQ answer
    expect(screen.getByText('42')).toBeInTheDocument()  // numeric answer
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
  })

  it('renders uploaded files list in view mode', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_WITH_BOOLEAN })
    renderPage('6')

    await screen.findByText('Biology Quiz')
    expect(screen.getByText('biology.pdf')).toBeInTheDocument()
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

    expect(screen.getByRole('dialog', { name: /delete exercise/i })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    expect(deleteExerciseMock).toHaveBeenCalledWith('teacher-token', 5)
    expect(await screen.findByText('Exercises list')).toBeInTheDocument()
  })
})
