import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherStudentsPage from './TeacherStudentsPage'

const createStudentMock = vi.fn()
const approveStudentMock = vi.fn()
const listStudentsMock = vi.fn()
const updateStudentNameMock = vi.fn()
const updateStudentGradesMock = vi.fn()
const updateStudentAccessTierMock = vi.fn()
const updateStudentStatusMock = vi.fn()
const updateStudentGlobalStatusMock = vi.fn()
const authMock = vi.hoisted(() => ({ value: {} }))
const removeStudentMock = vi.fn()
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
    updateStudentName: (...args) => updateStudentNameMock(...args),
    updateStudentGrades: (...args) => updateStudentGradesMock(...args),
    updateStudentAccessTier: (...args) => updateStudentAccessTierMock(...args),
    updateStudentStatus: (...args) => updateStudentStatusMock(...args),
    updateStudentGlobalStatus: (...args) => updateStudentGlobalStatusMock(...args),
    removeStudent: (...args) => removeStudentMock(...args),
  }
})

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('../lib/auth-context', () => ({
  useAuth: () => authMock.value,
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
    authMock.value = {
      user: { id: 5, phone: '+84865481769', platform_role: 'user', disabled_at: null },
      membership: { role: 'teacher', status: 'active' }, workspace: { id: 'maths' },
      token: 'test-token', canManage: true, isPlatformAdmin: false, logout: logoutMock,
    }
    updateStudentGlobalStatusMock.mockReset().mockResolvedValue({ data: {} })
    createStudentMock.mockReset()
    approveStudentMock.mockReset()
    listStudentsMock.mockReset()
    updateStudentNameMock.mockReset()
    updateStudentGradesMock.mockReset()
    updateStudentAccessTierMock.mockReset()
    updateStudentStatusMock.mockReset()
    removeStudentMock.mockReset()
    logoutMock.mockReset()
    navigateMock.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
  })

  it.each([false, true])('requires explicit confirmation before changing global disabled=%s', async (globally_disabled) => {
    authMock.value.isPlatformAdmin = true
    authMock.value.user.platform_role = 'platform_admin'
    listStudentsMock.mockResolvedValue({ data: [{ id: 7, name: 'Mai', phone: '+84900000001', status: 'active', grades: [10], platform_role: 'user', globally_disabled }] })
    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Mai' }))
    await userEvent.click(screen.getByRole('menuitem', { name: `${globally_disabled ? 'Restore' : 'Disable'} shared account for Mai` }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: globally_disabled ? 'Restore account' : 'Disable everywhere' })
    expect(confirm).toBeDisabled()
    expect(updateStudentGlobalStatusMock).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('Type GLOBAL to confirm'), 'GLOBAL')
    await userEvent.click(confirm)
    expect(updateStudentGlobalStatusMock).toHaveBeenCalledWith('test-token', 7, { disabled: !globally_disabled })
    expect(updateStudentStatusMock).not.toHaveBeenCalled()
  })

  it('does not expose global status controls for administrator targets', async () => {
    authMock.value.isPlatformAdmin = true
    listStudentsMock.mockResolvedValue({ data: [{ id: 7, name: 'Admin', phone: '+84900000001', status: 'active', grades: [10], platform_role: 'platform_admin' }] })
    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Admin' }))
    expect(screen.queryByRole('menuitem', { name: /shared account/ })).not.toBeInTheDocument()
  })

  it('keeps teacher actions workspace-only', async () => {
    listStudentsMock.mockResolvedValue({ data: [{ id: 7, name: 'Mai', status: 'active', grades: [10], platform_role: 'user' }] })
    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'More actions for Mai' }))
    expect(screen.queryByRole('menuitem', { name: /shared account/ })).not.toBeInTheDocument()
  })

  it('requires programme assignment before reactivation', async () => {
    listStudentsMock.mockResolvedValue({ data: [{ id: 7, name: 'Mai', status: 'disabled', grades: [] }] })
    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Disabled' }))
    expect(await screen.findByRole('button', { name: 'Activate Mai' })).toBeDisabled()
    expect(screen.getByText('Assign programmes first, then approve.')).toBeInTheDocument()
  })

  it('assigns programmes to a pending member without silently approving', async () => {
    listStudentsMock.mockResolvedValueOnce({ data: [{ id: 7, name: 'Mai', status: 'pending', grades: [] }] })
      .mockResolvedValue({ data: [{ id: 7, name: 'Mai', status: 'pending', grades: [12] }] })
    updateStudentGradesMock.mockResolvedValue({ data: {} })
    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Select Mai'))
    await userEvent.click(screen.getByRole('button', { name: 'Assign programmes to 1 student' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled())
    expect(updateStudentGradesMock).toHaveBeenCalledWith('test-token', { student_ids: [7], grades: [12] })
    expect(approveStudentMock).not.toHaveBeenCalled()
  })

  it('focuses the create form from the sidebar creation path', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/students?create=student']}>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Name')).toHaveFocus()
  })

  it('renders empty state when there are no students', async () => {
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /no students yet/i })).toBeInTheDocument()
  })

  it('shows a load error instead of the empty state and retries with the active filter', async () => {
    const user = userEvent.setup()
    listStudentsMock
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce({ data: [] })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    expect(await screen.findByText('Couldn’t load students')).toBeInTheDocument()
    expect(screen.queryByText(/No students yet/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pending' }))
    expect(await screen.findByText(/No pending students match this filter/i)).toBeInTheDocument()
    expect(listStudentsMock).toHaveBeenLastCalledWith('test-token', { status: 'pending' })
  })

  it('does not show rows from a different filter when the filtered request fails', async () => {
    const user = userEvent.setup()
    listStudentsMock
      .mockResolvedValueOnce({ data: [{ id: 1, phone: '+84123456789', status: 'active', created_at: '2026-05-07' }] })
      .mockRejectedValueOnce(new Error('Network failed'))

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    await screen.findByText('+84123456789')
    await user.click(screen.getByRole('button', { name: 'Active' }))

    expect(await screen.findByText('Couldn’t load students')).toBeInTheDocument()
    expect(screen.queryByText('+84123456789')).not.toBeInTheDocument()
    expect(screen.queryByText(/No students yet/i)).not.toBeInTheDocument()
  })

  it('renders student list table', async () => {
    listStudentsMock.mockResolvedValue({
      data: [
        { id: 1, name: 'Nguyễn Văn An', phone: '+84123456789', role: 'student', status: 'active', access_tier: 'vip', grades: [10, 11], created_at: '2026-05-07 10:00:00' },
        { id: 2, name: 'Trần Thị Bình', phone: '+84987654321', role: 'student', status: 'pending', access_tier: 'standard', grades: [12], created_at: '2026-05-06 09:00:00' },
      ],
    })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument()
    expect(screen.getByText('+84123456789')).toBeInTheDocument()
    expect(screen.getByText('+84987654321')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Grade 10').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Grade 11').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Grade 12').length).toBeGreaterThanOrEqual(1)
    const studentList = screen.getByTestId('responsive-student-list')
    expect(within(studentList).getByText('Active').closest('[data-slot="badge"]')).toHaveAttribute('data-variant', 'success')
    expect(within(studentList).getByText('VIP')).toBeInTheDocument()
    expect(within(studentList).getByText('Standard')).toBeInTheDocument()
    expect(studentList).toHaveClass('grid')
    expect(screen.getByText('Nguyễn Văn An')).toHaveClass('min-w-0')
  })

  it('bulk-assigns multiple class memberships to selected students', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({
      data: [
        { id: 1, name: 'Nguyễn Văn An', phone: '+84123456789', role: 'student', status: 'active', grades: [10], created_at: '2026-05-07 10:00:00' },
        { id: 2, name: 'Trần Thị Bình', phone: '+84987654321', role: 'student', status: 'active', grades: [12], created_at: '2026-05-06 09:00:00' },
      ],
    })
    updateStudentGradesMock.mockResolvedValue({ data: {}, message: 'Student grades updated.' })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    await user.click(await screen.findByLabelText('Select Nguyễn Văn An'))
    await user.click(screen.getByLabelText('Select Trần Thị Bình'))
    const bulkGrades = screen.getByRole('button', { name: 'Programmes to assign' })
    expect(bulkGrades).toHaveTextContent('Grade 12')
    await user.click(bulkGrades)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Grade 10' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Grade 11' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Assign programmes to 2 students' }))

    expect(updateStudentGradesMock).toHaveBeenCalledWith('test-token', {
      student_ids: [1, 2],
      grades: [10, 11, 12],
    })
    await waitFor(() => expect(listStudentsMock).toHaveBeenCalledTimes(2))
  })

  it('bulk-assigns one access tier without changing programmes', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({
      data: [
        { id: 1, name: 'Nguyễn Văn An', phone: '+84123456789', role: 'student', status: 'active', access_tier: 'standard', grades: [10], created_at: '2026-05-07 10:00:00' },
        { id: 2, name: 'Trần Thị Bình', phone: '+84987654321', role: 'student', status: 'active', access_tier: 'standard', grades: [12], created_at: '2026-05-06 09:00:00' },
      ],
    })
    updateStudentAccessTierMock.mockResolvedValue({ data: {}, message: 'Student access tier updated.' })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    await user.click(await screen.findByLabelText('Select Nguyễn Văn An'))
    await user.click(screen.getByLabelText('Select Trần Thị Bình'))
    const tierGroup = screen.getByRole('group', { name: 'Access tier to assign' })
    expect(tierGroup.querySelector('[data-slot="segmented-button-group"]')).toBeInTheDocument()
    await user.click(within(tierGroup).getByRole('button', { name: 'VIP' }))
    await user.click(screen.getByRole('button', { name: 'Assign tier to 2 students' }))

    expect(updateStudentAccessTierMock).toHaveBeenCalledWith('test-token', {
      student_ids: [1, 2],
      access_tier: 'vip',
    })
    expect(updateStudentGradesMock).not.toHaveBeenCalled()
  })

  it('renders create student form', async () => {
    listStudentsMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    expect(screen.getByLabelText('Name')).toBeRequired()
    expect(screen.getByPlaceholderText(/\+84xxx/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Student programmes' })).toHaveTextContent('Grade 12')
    expect(screen.getByRole('button', { name: /create student/i })).toBeInTheDocument()
  })

  it('creates a student and refreshes list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({ data: [] })
    createStudentMock.mockResolvedValue({
      data: { id: 3, name: 'Nguyễn Văn An', phone: '+84111111111', role: 'student', status: 'active', defaultPassword: '123' },
      message: 'Student account created with default password 123.',
    })

    render(
      <MemoryRouter>
        <TeacherStudentsPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no students yet/i)

    await user.type(screen.getByLabelText('Name'), '  Nguyễn Văn An  ')
    const input = screen.getByPlaceholderText(/\+84xxx/)
    await user.type(input, '+84111111111')
    const createTierGroup = screen.getByRole('group', { name: 'Student access tier' })
    expect(createTierGroup.querySelector('[data-slot="segmented-button-group"]')).toBeInTheDocument()
    await user.click(within(createTierGroup).getByRole('button', { name: 'VIP' }))
    await user.click(screen.getByRole('button', { name: /create student/i }))

    await waitFor(() => {
      expect(createStudentMock).toHaveBeenCalledWith('test-token', {
        name: 'Nguyễn Văn An',
        phone: '+84111111111',
        grades: [12],
        access_tier: 'vip',
      })
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

    await user.type(screen.getByLabelText('Name'), 'Nguyễn Văn An')
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

    await user.type(screen.getByLabelText('Name'), 'Nguyễn Văn An')
    await user.click(screen.getByRole('button', { name: /create student/i }))

    expect(await screen.findByText(/phone is required/i)).toBeInTheDocument()
    expect(createStudentMock).not.toHaveBeenCalled()
  })

  it('shows validation error for an empty name', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({ data: [] })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    await screen.findByText(/no students yet/i)
    await user.type(screen.getByPlaceholderText(/\+84xxx/), '+84111111111')
    await user.click(screen.getByRole('button', { name: /create student/i }))

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(createStudentMock).not.toHaveBeenCalled()
  })

  it('lets a teacher rename a student and refreshes the list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({
      data: [{
        id: 1,
        name: 'Nguyễn Văn An',
        phone: '+84123456789',
        role: 'student',
        status: 'active',
        created_at: '2026-05-07 10:00:00',
      }],
    })
    updateStudentNameMock.mockResolvedValue({
      data: { id: 1, name: 'Nguyễn An' },
      message: 'Student name updated.',
    })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'More actions for Nguyễn Văn An' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename Nguyễn Văn An' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename student' })
    const nameInput = within(dialog).getByRole('textbox', { name: 'Workspace display name' })
    await user.clear(nameInput)
    await user.type(nameInput, '  Nguyễn An  ')
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }))

    await waitFor(() => {
      expect(updateStudentNameMock).toHaveBeenCalledWith('test-token', 1, {
        name: 'Nguyễn An',
      })
    })
    await waitFor(() => {
      expect(listStudentsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('lets a teacher remove a student after confirmation and refreshes the list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({
      data: [{
        id: 1,
        name: 'Nguyễn Văn An',
        phone: '+84123456789',
        role: 'student',
        status: 'active',
        created_at: '2026-05-07 10:00:00',
      }],
    })
    removeStudentMock.mockResolvedValue({
      data: { id: 1, removed: true },
      message: 'Student removed.',
    })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'More actions for Nguyễn Văn An' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove Nguyễn Văn An' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove student' })
    expect(within(dialog).getByRole('button', { name: 'Remove student' })).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/type remove to confirm/i), 'REMOVE')
    await user.click(within(dialog).getByRole('button', { name: 'Remove student' }))

    await waitFor(() => {
      expect(removeStudentMock).toHaveBeenCalledWith('test-token', 1)
    })
    expect(toastMock.success).toHaveBeenCalledWith('Student removed.')
    await waitFor(() => {
      expect(listStudentsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('lets a teacher deactivate an active student and refreshes the list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({
      data: [{
        id: 1,
        name: 'Nguyễn Văn An',
        phone: '+84123456789',
        role: 'student',
        status: 'active',
        created_at: '2026-05-07 10:00:00',
      }],
    })
    updateStudentStatusMock.mockResolvedValue({
      data: { id: 1, status: 'disabled' },
      message: 'Student deactivated.',
    })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: 'Deactivate Nguyễn Văn An' }))

    await waitFor(() => {
      expect(updateStudentStatusMock).toHaveBeenCalledWith('test-token', 1, { status: 'disabled' })
    })
    expect(toastMock.success).toHaveBeenCalledWith('Student deactivated.')
    await waitFor(() => {
      expect(listStudentsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('lets a teacher activate a disabled student and refreshes the list', async () => {
    const user = userEvent.setup()
    listStudentsMock.mockResolvedValue({
      data: [{
        id: 1,
        name: 'Nguyễn Văn An',
        phone: '+84123456789',
        role: 'student',
        status: 'disabled',
        grades: [12],
        created_at: '2026-05-07 10:00:00',
      }],
    })
    updateStudentStatusMock.mockResolvedValue({
      data: { id: 1, status: 'active' },
      message: 'Student activated.',
    })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'Disabled' }))

    await user.click(await screen.findByRole('button', { name: 'Activate Nguyễn Văn An' }))

    await waitFor(() => {
      expect(updateStudentStatusMock).toHaveBeenCalledWith('test-token', 1, { status: 'active' })
    })
    expect(toastMock.success).toHaveBeenCalledWith('Student activated.')
    await waitFor(() => {
      expect(listStudentsMock).toHaveBeenCalledTimes(3)
    })
  })

  it('hides disabled students from the default list and shows them through the disabled filter', async () => {
    const user = userEvent.setup()
    listStudentsMock
      .mockResolvedValueOnce({
        data: [
          { id: 1, name: 'Active Student', phone: '+84123456789', role: 'student', status: 'active', created_at: '2026-05-07 10:00:00' },
          { id: 2, name: 'Removed Student', phone: '+84987654321', role: 'student', status: 'disabled', created_at: '2026-05-06 09:00:00' },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: 2, name: 'Removed Student', phone: '+84987654321', role: 'student', status: 'disabled', created_at: '2026-05-06 09:00:00' }],
      })

    render(<MemoryRouter><TeacherStudentsPage /></MemoryRouter>)

    expect(await screen.findByText('Active Student')).toBeInTheDocument()
    expect(screen.queryByText('Removed Student')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Disabled' }))

    expect(await screen.findByText('Removed Student')).toBeInTheDocument()
    expect(listStudentsMock).toHaveBeenLastCalledWith('test-token', { status: 'disabled' })
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
    expect(screen.getByRole('button', { name: /disabled/i })).toBeInTheDocument()
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
          { id: 1, name: 'Nguyễn Văn An', phone: '+84123456789', role: 'student', status: 'pending', grades: [12], created_at: '2026-05-07 10:00:00' },
          { id: 2, name: 'Trần Thị Bình', phone: '+84987654321', role: 'student', status: 'active', created_at: '2026-05-06 09:00:00' },
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
