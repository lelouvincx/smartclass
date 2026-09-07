import React, { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lectureProgressKey } from '@/lib/lecture-progress'
import YouTubeLecturePlayer from './youtube-lecture-player'

const loadYouTubeIframeAPIMock = vi.fn()

vi.mock('@/lib/youtube-player-api', () => ({
  loadYouTubeIframeAPI: () => loadYouTubeIframeAPIMock(),
}))

const identity = { accountId: 7, lectureId: 12, videoId: 'abcdefghijk' }

function createYouTubeAPI() {
  let options
  let currentTime = 0
  let playerState = 5
  const player = {
    destroy: vi.fn(),
    getCurrentTime: vi.fn(() => currentTime),
    getPlayerState: vi.fn(() => playerState),
  }
  const Player = vi.fn(function Player(_iframe, nextOptions) {
    options = nextOptions
    return player
  })

  return {
    api: { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 } },
    player,
    getOptions: () => options,
    setCurrentTime: (value) => { currentTime = value },
    setPlayerState: (value) => { playerState = value },
  }
}

function renderPlayer(element = <YouTubeLecturePlayer {...identity} title="Introduction video" />) {
  return render(element)
}

describe('YouTubeLecturePlayer', () => {
  beforeEach(() => {
    localStorage.clear()
    loadYouTubeIframeAPIMock.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it('restores through the iframe URL without autoplay or an imperative seek', async () => {
    const youtube = createYouTubeAPI()
    localStorage.setItem(lectureProgressKey(identity), '42')
    loadYouTubeIframeAPIMock.mockResolvedValue(youtube.api)

    renderPlayer()

    const iframe = screen.getByTitle('Introduction video')
    expect(iframe.src).toContain('start=42')
    expect(iframe.src).toContain('enablejsapi=1')
    expect(iframe.src).toContain(`origin=${encodeURIComponent(window.location.origin)}`)

    await act(async () => {})
    expect(youtube.api.Player).toHaveBeenCalledOnce()
    expect(youtube.player).not.toHaveProperty('seekTo')
    expect(youtube.player).not.toHaveProperty('playVideo')
  })

  it('saves while playing, flushes on pause, and cannot recreate ended progress', async () => {
    vi.useFakeTimers()
    const youtube = createYouTubeAPI()
    loadYouTubeIframeAPIMock.mockResolvedValue(youtube.api)
    const view = renderPlayer()
    await act(async () => {})
    const options = youtube.getOptions()

    youtube.setCurrentTime(12.8)
    youtube.setPlayerState(1)
    act(() => options.events.onStateChange({ data: 1, target: youtube.player }))
    act(() => vi.advanceTimersByTime(5000))
    expect(localStorage.getItem(lectureProgressKey(identity))).toBe('12')

    youtube.setCurrentTime(19.4)
    youtube.setPlayerState(2)
    act(() => options.events.onStateChange({ data: 2, target: youtube.player }))
    expect(localStorage.getItem(lectureProgressKey(identity))).toBe('19')

    youtube.setPlayerState(0)
    act(() => options.events.onStateChange({ data: 0, target: youtube.player }))
    expect(localStorage.getItem(lectureProgressKey(identity))).toBeNull()

    view.unmount()
    expect(localStorage.getItem(lectureProgressKey(identity))).toBeNull()
    expect(youtube.player.destroy).toHaveBeenCalledOnce()
  })

  it('does not overwrite saved progress until playback has actually started', async () => {
    const youtube = createYouTubeAPI()
    localStorage.setItem(lectureProgressKey(identity), '42')
    loadYouTubeIframeAPIMock.mockResolvedValue(youtube.api)
    const view = renderPlayer()
    await act(async () => {})

    youtube.setCurrentTime(0)
    view.unmount()

    expect(localStorage.getItem(lectureProgressKey(identity))).toBe('42')
  })

  it('flushes active playback on pagehide', async () => {
    const youtube = createYouTubeAPI()
    loadYouTubeIframeAPIMock.mockResolvedValue(youtube.api)
    renderPlayer()
    await act(async () => {})
    const options = youtube.getOptions()

    youtube.setPlayerState(1)
    act(() => options.events.onStateChange({ data: 1, target: youtube.player }))
    youtube.setCurrentTime(27.8)
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(localStorage.getItem(lectureProgressKey(identity))).toBe('27')
  })

  it('keeps the ordinary iframe when the Player API fails', async () => {
    loadYouTubeIframeAPIMock.mockRejectedValue(new Error('blocked'))

    renderPlayer()
    await act(async () => {})

    expect(screen.getByTitle('Introduction video')).toBeInTheDocument()
  })

  it('ignores a late API result from the discarded Strict Mode lifecycle', async () => {
    let resolveAPI
    const youtube = createYouTubeAPI()
    const pendingAPI = new Promise((resolve) => { resolveAPI = resolve })
    loadYouTubeIframeAPIMock.mockReturnValue(pendingAPI)

    renderPlayer(
      <StrictMode>
        <YouTubeLecturePlayer {...identity} title="Introduction video" />
      </StrictMode>,
    )
    await act(async () => { resolveAPI(youtube.api) })

    expect(screen.getAllByTitle('Introduction video')).toHaveLength(1)
    expect(youtube.api.Player).toHaveBeenCalledOnce()
  })

  it('ignores player callbacks after the lifecycle is discarded', async () => {
    vi.useFakeTimers()
    const youtube = createYouTubeAPI()
    loadYouTubeIframeAPIMock.mockResolvedValue(youtube.api)
    const view = renderPlayer()
    await act(async () => {})
    const options = youtube.getOptions()

    view.unmount()
    localStorage.setItem(lectureProgressKey(identity), '44')
    youtube.setCurrentTime(18)
    youtube.setPlayerState(1)
    act(() => options.events.onReady({ target: youtube.player }))
    act(() => options.events.onStateChange({ data: 1, target: youtube.player }))
    act(() => vi.advanceTimersByTime(5000))
    act(() => options.events.onStateChange({ data: 0, target: youtube.player }))

    expect(localStorage.getItem(lectureProgressKey(identity))).toBe('44')
    expect(vi.getTimerCount()).toBe(0)
  })
})
