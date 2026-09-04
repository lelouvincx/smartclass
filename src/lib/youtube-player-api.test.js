import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadModule() {
  vi.resetModules()
  return import('./youtube-player-api')
}

describe('YouTube IFrame API loader', () => {
  beforeEach(() => {
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove())
    delete window.YT
    delete window.onYouTubeIframeAPIReady
  })

  afterEach(() => {
    delete window.YT
    delete window.onYouTubeIframeAPIReady
  })

  it('resolves immediately when the API is already loaded', async () => {
    window.YT = { Player: vi.fn() }
    const { loadYouTubeIframeAPI } = await loadModule()

    await expect(loadYouTubeIframeAPI()).resolves.toBe(window.YT)
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull()
  })

  it('shares one script and promise between concurrent callers', async () => {
    const { loadYouTubeIframeAPI } = await loadModule()
    const first = loadYouTubeIframeAPI()
    const second = loadYouTubeIframeAPI()

    expect(second).toBe(first)
    expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1)

    window.YT = { Player: vi.fn() }
    window.onYouTubeIframeAPIReady()

    await expect(first).resolves.toBe(window.YT)
  })

  it('settles after invoking an existing callback even when it throws', async () => {
    const previousCallback = vi.fn(() => { throw new Error('other integration failed') })
    window.onYouTubeIframeAPIReady = previousCallback
    const { loadYouTubeIframeAPI } = await loadModule()
    const result = loadYouTubeIframeAPI()

    window.YT = { Player: vi.fn() }
    window.onYouTubeIframeAPIReady()

    expect(previousCallback).toHaveBeenCalledOnce()
    await expect(result).resolves.toBe(window.YT)
  })

  it('rejects when the API script fails to load', async () => {
    const { loadYouTubeIframeAPI } = await loadModule()
    const result = loadYouTubeIframeAPI()
    const script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')

    script.dispatchEvent(new Event('error'))

    await expect(result).rejects.toThrow('YouTube IFrame API failed to load')
  })
})
