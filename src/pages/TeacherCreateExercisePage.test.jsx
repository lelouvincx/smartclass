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
    logoutMock.mockReset()
  })

  it('allows manual schema save without answer pdf', async () => {
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

    expect(screen.getByRole('button', { name: 'Generate Schema' })).toBeDisabled()
  })
})
