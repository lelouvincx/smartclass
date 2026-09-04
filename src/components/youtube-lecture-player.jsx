import React, { useEffect, useRef } from 'react'
import { getYouTubeEmbedUrl } from '@/lib/lectures'
import {
  readLectureProgress,
  removeLectureProgress,
  writeLectureProgress,
} from '@/lib/lecture-progress'
import { loadYouTubeIframeAPI } from '@/lib/youtube-player-api'

const SAVE_INTERVAL_MS = 5000

export default function YouTubeLecturePlayer({ accountId, lectureId, title, videoId }) {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const identity = { accountId, lectureId, videoId }
    const savedSeconds = readLectureProgress(identity)
    const iframe = document.createElement('iframe')
    iframe.className = 'h-full w-full'
    iframe.src = getYouTubeEmbedUrl(`https://youtu.be/${videoId}`, {
      enableJsApi: true,
      origin: window.location.origin,
      startSeconds: savedSeconds,
    })
    iframe.title = title
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.allowFullscreen = true
    host.replaceChildren(iframe)

    let active = true
    let ended = false
    let hasPlayed = false
    let player = null
    let saveInterval = null
    let YouTubeApi = null

    function stopSaving() {
      if (saveInterval !== null) {
        window.clearInterval(saveInterval)
        saveInterval = null
      }
    }

    function removeSavedProgress() {
      ended = true
      stopSaving()
      removeLectureProgress(identity)
    }

    function flushProgress() {
      if (!player || ended || !hasPlayed) return

      try {
        if (player.getPlayerState() === YouTubeApi?.PlayerState?.ENDED) {
          removeSavedProgress()
          return
        }

        writeLectureProgress(identity, player.getCurrentTime())
      } catch {
        // The persistence enhancement must never interrupt playback.
      }
    }

    function startSaving() {
      if (saveInterval !== null || ended) return
      hasPlayed = true
      saveInterval = window.setInterval(flushProgress, SAVE_INTERVAL_MS)
    }

    function handleStateChange(event, YouTube) {
      if (event.data === YouTube.PlayerState.PLAYING) {
        startSaving()
        return
      }

      stopSaving()
      if (event.data === YouTube.PlayerState.ENDED) {
        removeSavedProgress()
      } else {
        flushProgress()
      }
    }

    function handlePageHide() {
      flushProgress()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushProgress()
    }

    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    loadYouTubeIframeAPI()
      .then((YouTube) => {
        if (!active || !host.contains(iframe)) return

        YouTubeApi = YouTube
        player = new YouTube.Player(iframe, {
          events: {
            onReady: (event) => {
              player = event.target
              try {
                if (player.getPlayerState() === YouTube.PlayerState.PLAYING) startSaving()
              } catch {
                // Playback remains usable if player state is unavailable.
              }
            },
            onStateChange: (event) => handleStateChange(event, YouTube),
          },
        })
      })
      .catch(() => {
        // The iframe was inserted first and remains a fully usable fallback.
      })

    return () => {
      active = false
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopSaving()
      flushProgress()

      try {
        player?.destroy()
      } catch {
        // The host cleanup below is authoritative.
      }

      host.replaceChildren()
    }
  }, [accountId, lectureId, title, videoId])

  return <div ref={hostRef} className="aspect-video w-full" />
}
