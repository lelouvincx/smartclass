const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api'

let apiPromise = null

export function loadYouTubeIframeAPI() {
  if (globalThis.window?.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      try {
        previousCallback?.()
      } catch {
        // Another integration must not prevent this loader from settling.
      }

      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        reject(new Error('YouTube IFrame API loaded without a Player constructor'))
      }
    }

    let script = document.querySelector(`script[src="${YOUTUBE_IFRAME_API_URL}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = YOUTUBE_IFRAME_API_URL
      script.async = true
      document.head.append(script)
    }

    script.addEventListener('error', () => {
      reject(new Error('YouTube IFrame API failed to load'))
    }, { once: true })
  })

  return apiPromise
}
