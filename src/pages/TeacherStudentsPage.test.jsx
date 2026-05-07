import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherStudentsPage from './TeacherStudentsPage'

const createStudentMock = vi.fn()
const approveStudentMock = vi.fn()
const listStudentsMock = vi.fn()
const logoutMock = vi.fn()
const navigateMock = vi.fn()

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createStudent: (...args) => createStudentMock(...args),
    approveStudent: (...args) => approveStudentMock(...args),
    listStudents: (...args) => listStudentsMock(...args),
  }
})

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    user: { phone: '+84865481769', role: 'teacher' },
    token: 'test-token',
    logout: logoutMock,
  }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

describe('TeacherStudentsPage', () => {
  beforeEach(() => {
    createStudentMock.mockReset()
    approveStudentMock.mockReset()
    listStudentsMock.mockReset()
    logoutMock.mockReset()
    navigateMock.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
  })

  it('renders empty state when there are no students', async () => {
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/no students yet/i)).toBeInTheDocument()
  })

  it('renders student list table', async () => {
    listStudentsMock.mockResolvedValue({
      data: [
        { id: 1, phone: '+84123456789', role: 'student', status: 'active', created_at: '2026-05-07 10:00:00' },
        { id: 2, phone: '+84987654321', role: 'student', status: 'pending', created_at: '2026-05-06 09:00:00' },
      ],
    })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('+84123456789')).toBeInTheDocument()
    expect(screen.getByText('+84987654321')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1)
  })

  it('renders create student form', async () => {
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    expect(screen.getByPlaceholderText(/\+84xxx/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create student/i })).toBeInTheDocument()
  })

  it('creates a student and refreshes list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({ data: [] })
    createStudentMock.mockResolvedValue({
      data: { id: 3, phone: '+84111111111', role: 'student', status: 'active', defaultPassword: '123' },
      message: 'Student account created with default password 123.',
    })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    const input = screen.getByPlaceholderText(/\+84xxx/)
    await user.type(input, '+84111111111')
    await user.click(screen.getByRole('button', { name: /create student/i }))

    await waitFor(() => {
      expect(createStudentMock).toHaveBeenCalledWith('test-token', { phone: '+84111111111' })
    })

    await waitFor(() => {
      expect(listStudentsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('shows error on duplicate phone', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({ data: [] })
    createStudentMock.mockRejectedValue(new Error('Phone number is already registered.'))

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    await user.type(screen.getByPlaceholderText(/\+84xxx/), '+84865481769')
    await user.click(screen.getByRole('button', { name: /create student/i }))

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('shows validation error for empty phone', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    await user.click(screen.getByRole('button', { name: /create student/i }))

    expect(await screen.findByText(/phone is required/i)).toBeInTheDocument()
    expect(createStudentMock).not.toHaveBeenCalled()
  })

  it('shows status filter tabs', async () => {
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    expect(screen.getByRole('button', { name: /active/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pending/i })).toBeInTheDocument()
  })

  it('changes filter and reloads list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    await user.click(screen.getByRole('button', { name: /pending/i }))

    await waitFor(() => {
      expect(listStudentsMock).toHaveBeenCalledWith('test-token', { status: 'pending' })
    })
  })

  describe('approve pending student', () => {
    beforeEach(() => {
      listStudentsMock.mockResolvedValue({
        data: [
          { id: 1, phone: '+84123456789', role: 'student', status: 'pending', created_at: '2026-05-07 10:00:00' },
          { id: 2, phone: '+84987654321', role: 'student', status: 'active', created_at: '2026-05-06 09:00:00' },
        ],
      })
    })

    it('shows Approve button only on pending rows', async () => {
      render(
        <MemoryRouter>
          <TeacherStudentsPage />
        </MemoryRouter>,
      )

      await screen.findByText('+84123456789')

      const buttons = screen.getAllByRole('button', { name: /approve/i })
      expect(buttons).toHaveLength(1)
    })

    it('calls approveStudent on click and reloads list', async () => {
      const user = userEvent.setup()
      approveStudentMock.mockResolvedValue({
        data: { id: 1, status: 'active' },
        message: 'Student approved successfully.',
      })

      render(
        <MemoryRouter>
          <TeacherStudentsPage />
        </MemoryRouter>,
      )

      await screen.findByText('+84123456789')

      await user.click(screen.getByRole('button', { name: /approve/i }))

      await waitFor(() => {
        expect(approveStudentMock).toHaveBeenCalledWith('test-token', 1)
      })

      await waitFor(() => {
        expect(listStudentsMock).toHaveBeenCalledTimes(2)
      })
    })

    it('shows success toast on approve', async () => {
      const user = userEvent.setup()
      approveStudentMock.mockResolvedValue({
        data: { id: 1, status: 'active' },
        message: 'Student approved successfully.',
      })

      render(
        <MemoryRouter>
          <TeacherStudentsPage />
        </MemoryRouter>,
      )

      await screen.findByText('+84123456789')
      await user.click(screen.getByRole('button', { name: /approve/i }))

      await waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith('Student approved successfully.')
      })
    })

    it('shows error toast on approve failure', async () => {
      const user = userEvent.setup()
      approveStudentMock.mockRejectedValue(new Error('User not found.'))

      render(
        <MemoryRouter>
          <TeacherStudentsPage />
        </MemoryRouter>,
      )

      await screen.findByText('+84123456789')
      await user.click(screen.getByRole('button', { name: /approve/i }))

      await waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith('User not found.')
      })
    })

    it('disables approve button while approving', async () => {
      const user = userEvent.setup()

      let resolveApprove
      approveStudentMock.mockImplementation(
        () => new Promise((resolve) => { resolveApprove = resolve }),
      )

      render(
        <MemoryRouter>
          <TeacherStudentsPage />
        </MemoryRouter>,
      )

      await screen.findByText('+84123456789')

      await user.click(screen.getByRole('button', { name: /approve/i }))

      expect(screen.getByRole('button', { name: /approving/i })).toBeDisabled()

      resolveApprove({
        data: { id: 1, status: 'active' },
        message: 'Student approved successfully.',
      })
    })
  })
})
