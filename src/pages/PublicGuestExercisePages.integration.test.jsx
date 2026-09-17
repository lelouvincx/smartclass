import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { AuthProvider } from '@/lib/auth-context'
import { AUTH_TOKEN_KEY } from '@/lib/auth'
import { changeLanguage } from '@/i18n'
import { AppRoutes } from '@/router'
import {
  clearAllGuestExerciseData,
  createGuestAttempt,
  findGuestExerciseState,
  submitGuestAttempt,
} from '@/lib/guest-exercise-db'

const API_ORIGIN = 'http://maths-api.test'

const schema = [
  { q_id: 1, section_key: 'main', section_title: null, local_number: 1, sub_id: null, type: 'mcq', correct_answer: 'B', max_score_hundredths: 250 },
  { q_id: 2, section_key: 'main', section_title: null, local_number: 2, sub_id: null, type: 'numeric', correct_answer: '3.5', max_score_hundredths: 250 },
  { q_id: 3, section_key: 'main', section_title: null, local_number: 3, sub_id: 'a', type: 'boolean', correct_answer: '1', max_score_hundredths: 500 },
  { q_id: 3, section_key: 'main', section_title: null, local_number: 3, sub_id: 'b', type: 'boolean', correct_answer: '0', max_score_hundredths: 500 },
  { q_id: 3, section_key: 'main', section_title: null, local_number: 3, sub_id: 'c', type: 'boolean', correct_answer: '1', max_score_hundredths: 500 },
  { q_id: 3, section_key: 'main', section_title: null, local_number: 3, sub_id: 'd', type: 'boolean', correct_answer: '0', max_score_hundredths: 500 },
]

const currentExercise = {
  id: 42,
  workspace_id: 'maths',
  title: 'Guest Algebra',
  duration_minutes: 0,
  is_timed: 0,
  minimum_access_tier: 'guest',
  question_asset_set_id: 100,
  question_count: 3,
  schema,
  question_assets: [
    { id: 701, q_id: 1, segment_index: 0, file_url: '/api/public/question-assets/701', accessible_text: 'Question 1' },
    { id: 702, q_id: 2, segment_index: 0, file_url: '/api/public/question-assets/702', accessible_text: 'Question 2' },
    { id: 703, q_id: 3, segment_index: 0, file_url: '/api/public/question-assets/703', accessible_text: 'Question 3' },
  ],
}

function publicList(exercise = currentExercise) {
  const { schema: _schema, question_assets: _assets, ...item } = exercise
  return [{ ...item, question_count: 3 }]
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function installFetch({ exercise = currentExercise, rejectPublicAfterSubmit = false } = {}) {
  let submitted = false
  const calls = []
  const fetchMock = vi.fn(async (url, options = {}) => {
    const requestUrl = String(url)
    calls.push([requestUrl, options])
    if (requestUrl === `${API_ORIGIN}/api/auth/me`) {
      return json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } }, { status: 401 })
    }
    if (rejectPublicAfterSubmit && submitted && requestUrl.startsWith(`${API_ORIGIN}/api/public`)) {
      throw new Error('Unexpected public fetch after local result')
    }
    if (requestUrl === `${API_ORIGIN}/api/public/exercises`) return json({ data: publicList(exercise) })
    if (requestUrl === `${API_ORIGIN}/api/public/exercises/42`) return json({ data: exercise })
    if (requestUrl === `${API_ORIGIN}/api/public/exercises/42/exercise-pdf`) return new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } })
    if (requestUrl.startsWith(`${API_ORIGIN}/api/public/question-assets/`)) return new Response('image', { headers: { 'Content-Type': 'image/png' } })
    throw new Error(`Unhandled request: ${requestUrl}`)
  })
  fetchMock.markSubmitted = (value = true) => { submitted = value }
  fetchMock.calls = calls
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderApp(initialEntry = '/exercises') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

async function startExercise(user) {
  renderApp('/exercises')
  expect(await screen.findByRole('heading', { name: 'Guest exercises' })).toBeInTheDocument()
  await user.click(await screen.findByRole('link', { name: 'Start' }))
  expect(await screen.findByRole('heading', { name: 'Guest Algebra' })).toBeInTheDocument()
  expect(screen.getByText(/answer key and score allocation/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Start' }))
  expect(await screen.findByText('Question 1')).toBeInTheDocument()
  return findGuestExerciseState(42, 100)
}

function openGuestDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('smartclass_guest_exercises_v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function updateStoredAttempt(localAttemptId, changes) {
  const db = await openGuestDb()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('attempts', 'readwrite')
      const store = tx.objectStore('attempts')
      const getRequest = store.get(localAttemptId)
      getRequest.onsuccess = () => store.put({ ...getRequest.result, ...changes })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

describe('Public guest exercise flow', () => {
  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('IDBKeyRange', IDBKeyRange)
    global.URL.createObjectURL = vi.fn(() => 'blob:question')
    global.URL.revokeObjectURL = vi.fn()
    window.open = vi.fn()
    localStorage.clear()
    sessionStorage.clear()
    await act(() => changeLanguage('en'))
    await clearAllGuestExerciseData().catch(() => {})
  })

  afterEach(async () => {
    vi.useRealTimers()
    await clearAllGuestExerciseData().catch(() => {})
    vi.unstubAllGlobals()
  })

  it('starts, persists, resumes, submits, reviews, and clears a local Guest result without submission APIs', async () => {
    const user = userEvent.setup()
    const fetchMock = installFetch()

    const firstRender = renderApp('/exercises')
    expect(await screen.findByRole('heading', { name: 'Guest exercises' })).toBeInTheDocument()
    expect(screen.queryByText('Keep learning with a free account')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('link', { name: 'Start' }))
    expect(await screen.findByRole('heading', { name: 'Guest Algebra' })).toBeInTheDocument()
    expect(screen.getByText(/answer key and score allocation/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByText('Question 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'B' }))
    const state = await findGuestExerciseState(42, 100)
    firstRender.unmount()

    const resumed = renderApp(`/exercises/42/take?attempt=${state.localAttemptId}`)
    expect(await screen.findByText('Question 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('data-variant', 'default')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Question 2 numeric answer'), '3.5')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    const trueButtons = screen.getAllByRole('button', { name: 'True' })
    const falseButtons = screen.getAllByRole('button', { name: 'False' })
    await user.click(trueButtons[0])
    await user.click(falseButtons[1])
    await user.click(trueButtons[2])
    await user.click(falseButtons[3])
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('10 / 10')).toBeInTheDocument()
    expect(await screen.findByText('Keep learning with a free account')).toBeInTheDocument()
    expect(screen.getByText('Register to save future work with your class. Your guest results stay on this device and will not be uploaded.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register')
    expect(screen.getByText('Correct answers: 6 / 6')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'View detailed results' }))
    expect(await screen.findByText('Correct Answer: B')).toBeInTheDocument()
    expect(screen.getByText('Correct Answer: 3.5')).toBeInTheDocument()
    resumed.unmount()

    fetchMock.markSubmitted(false)
    const listAgain = renderApp('/exercises')
    expect(await screen.findByRole('link', { name: 'View result' })).toBeInTheDocument()
    expect(await screen.findByText('Keep learning with a free account')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear local guest data' }))
    expect(await screen.findByRole('link', { name: 'Start' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Keep learning with a free account')).not.toBeInTheDocument())
    listAgain.unmount()
    renderApp(`/exercises/42/results/${state.localAttemptId}`)
    expect(await screen.findByText('Guest result not found')).toBeInTheDocument()
    expect(fetchMock.calls.some(([url]) => url.includes('/api/submissions'))).toBe(false)
  }, 10000)

  it('prompts after a guest starts a second local attempt in the same workspace', async () => {
    const user = userEvent.setup()
    installFetch()

    await createGuestAttempt(currentExercise)

    renderApp('/exercises/42')

    expect(await screen.findByRole('heading', { name: 'Guest Algebra' })).toBeInTheDocument()
    expect(screen.queryByText('Keep learning with a free account')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Question 1')).toBeInTheDocument()
    expect(await screen.findByText('Keep learning with a free account')).toBeInTheDocument()
  })

  it('does not prompt from a prior attempt in another workspace', async () => {
    const user = userEvent.setup()
    installFetch()

    await createGuestAttempt({ ...currentExercise, workspace_id: 'english' })

    renderApp('/exercises/42')

    expect(await screen.findByRole('heading', { name: 'Guest Algebra' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByText('Question 1')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Keep learning with a free account')).not.toBeInTheDocument())
  })

  it('does not resume stale drafts from the list or direct Take URL, while old results remain viewable', async () => {
    const user = userEvent.setup()
    installFetch()
    const oldAttempt = await createGuestAttempt({ ...currentExercise, question_asset_set_id: 99 })
    const oldSubmitted = await createGuestAttempt({ ...currentExercise, question_asset_set_id: 99 })
    await submitGuestAttempt(oldSubmitted.localAttemptId)

    const staleList = renderApp('/exercises')
    expect(await screen.findByRole('link', { name: 'Start' })).toHaveAttribute('href', '/exercises/42')
    expect(screen.queryByRole('link', { name: 'Resume' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Start' }))
    expect(await screen.findByText(/has changed since your local attempt started/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Resume' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Question 1')).toBeInTheDocument()
    staleList.unmount()

    const direct = renderApp(`/exercises/42/take?attempt=${oldAttempt.localAttemptId}`)
    expect(await screen.findByText(/has changed since your local attempt started/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    direct.unmount()

    renderApp(`/exercises/42/results/${oldSubmitted.localAttemptId}`)
    expect(await screen.findByText('0 / 10')).toBeInTheDocument()
  })

  it('shows expired timed attempts on reload without auto-submitting them', async () => {
    const timedExercise = { ...currentExercise, duration_minutes: 1, is_timed: 1 }
    const attempt = await createGuestAttempt(timedExercise)
    await updateStoredAttempt(attempt.localAttemptId, { startedAt: new Date(Date.now() - 65_000).toISOString() })
    installFetch({ exercise: timedExercise })

    renderApp(`/exercises/42/take?attempt=${attempt.localAttemptId}`)

    expect(await screen.findByText('Question 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Timer')).toHaveTextContent('Time is up! You can still submit your answers.')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
    expect(await findGuestExerciseState(42, 100)).toMatchObject({ type: 'resume', localAttemptId: attempt.localAttemptId })
  })

  it('keeps public pages from retrying anonymously after an invalid stored token', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'bad-token')
    const fetchMock = installFetch()

    renderApp('/exercises')

    expect(await screen.findByRole('heading', { name: 'Sign-in problem' })).toBeInTheDocument()
    expect(fetchMock.calls).toEqual([
      [`${API_ORIGIN}/api/public/exercises`, expect.objectContaining({ headers: { Authorization: 'Bearer bad-token' } })],
      [`${API_ORIGIN}/api/auth/me`, expect.objectContaining({ headers: { Authorization: 'Bearer bad-token' } })],
    ])
    expect(fetchMock.calls.some(([url, options]) => (
      url === `${API_ORIGIN}/api/public/exercises` && !options.headers.Authorization
    ))).toBe(false)
  })

  it('falls back to page-memory storage when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const user = userEvent.setup()
    installFetch()

    await startExercise(user)
    await user.click(screen.getByRole('button', { name: 'B' }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('2.5 / 10')).toBeInTheDocument()
  })

  it('downloads the public source PDF through the public endpoint', async () => {
    const user = userEvent.setup()
    installFetch()

    await startExercise(user)
    await user.click(screen.getByRole('button', { name: 'Download full exercise PDF' }))

    await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:question', '_blank', 'noopener,noreferrer'))
    expect(fetch).toHaveBeenCalledWith(`${API_ORIGIN}/api/public/exercises/42/exercise-pdf`, { headers: {} })
  })
})
