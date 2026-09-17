import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { changeLanguage } from '@/i18n'
import TeacherCostDashboardPage from './TeacherCostDashboardPage'

const getGuestCostInventoryMock = vi.fn()
const authMock = { token: 'admin-token', isPlatformAdmin: true }

vi.mock('@/lib/api', () => ({
  getGuestCostInventory: (...args) => getGuestCostInventoryMock(...args),
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authMock,
}))

const inventory = {
  guest_exercises: [{
    id: 501,
    title: 'Guest algebra',
    question_assets: { count: 2, recorded_bytes: 400 },
    exercise_pdf: { metadata_present: true, recorded_bytes: 1200 },
    schema: { row_count: 2, question_count: 2 },
  }],
  guest_lectures: { public_placed_count: 3 },
  totals: {
    guest_exercise_count: 1,
    question_asset_count: 2,
    question_asset_recorded_bytes: 400,
    exercise_pdf_total_count: 1,
    exercise_pdf_known_count: 1,
    exercise_pdf_recorded_bytes: 1200,
    exercise_pdf_unknown_count: 0,
  },
  notes: ['estimate_not_invoice'],
}

describe('TeacherCostDashboardPage', () => {
  beforeEach(() => {
    authMock.token = 'admin-token'
    authMock.isPlatformAdmin = true
    getGuestCostInventoryMock.mockReset()
    return act(() => changeLanguage('en'))
  })

  it('renders inventory and updates scenario estimates', async () => {
    getGuestCostInventoryMock.mockResolvedValue({ data: inventory })

    render(<TeacherCostDashboardPage />)

    expect(screen.getByRole('heading', { name: 'Guest cost estimator' })).toBeInTheDocument()
    expect((await screen.findAllByText('Guest algebra')).length).toBeGreaterThan(0)
    expect(screen.getByText('Placed Guest lectures')).toBeInTheDocument()
    expect(screen.getByDisplayValue('25')).toBeInTheDocument()
    expect(screen.getByText('Monthly request and read volume')).toBeInTheDocument()
    expect(screen.getByText('Requests: 185')).toBeInTheDocument()
    expect(screen.getByText('Image reads: 50')).toBeInTheDocument()
    expect(screen.getByText('PDF reads: 10')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Complete exercise runs'), { target: { value: '5' } })
    await waitFor(() => expect(screen.getByText('10 image reads, 10 PDF reads')).toBeInTheDocument())
    expect(screen.getByText('Requests: 165')).toBeInTheDocument()
    expect(screen.getByText('Image reads: 10')).toBeInTheDocument()
    expect(screen.getByText('PDF reads: 10')).toBeInTheDocument()
  })

  it('shows empty, error and admin-only states', async () => {
    getGuestCostInventoryMock.mockResolvedValueOnce({
      data: {
        guest_exercises: [],
        guest_lectures: { public_placed_count: 0 },
        totals: { guest_exercise_count: 0, question_asset_count: 0, question_asset_recorded_bytes: 0, exercise_pdf_total_count: 0, exercise_pdf_known_count: 0, exercise_pdf_recorded_bytes: 0, exercise_pdf_unknown_count: 0 },
        notes: [],
      },
    })
    const { unmount } = render(<TeacherCostDashboardPage />)
    expect(await screen.findByText('No public Guest content yet')).toBeInTheDocument()
    unmount()

    getGuestCostInventoryMock.mockRejectedValueOnce(new Error('Server unavailable'))
    render(<TeacherCostDashboardPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
    unmount()
    cleanup()

    getGuestCostInventoryMock.mockClear()
    authMock.isPlatformAdmin = false
    render(<TeacherCostDashboardPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('You need workspace administrator access')
    expect(getGuestCostInventoryMock).not.toHaveBeenCalled()
  })

  it('localizes server note codes instead of rendering raw English API prose', async () => {
    await act(() => changeLanguage('vi'))
    getGuestCostInventoryMock.mockResolvedValue({ data: inventory })

    render(<TeacherCostDashboardPage />)

    expect(await screen.findByText('Lượng yêu cầu và lượt đọc hằng tháng')).toBeInTheDocument()
    expect(screen.getByText('Yêu cầu: 185')).toBeInTheDocument()
    expect(await screen.findByText('Đây là ước tính từ nội dung Khách công khai hiện tại, không phải lưu lượng thực tế hay hóa đơn.')).toBeInTheDocument()
    expect(screen.queryByText('estimate_not_invoice')).not.toBeInTheDocument()
  })
})
