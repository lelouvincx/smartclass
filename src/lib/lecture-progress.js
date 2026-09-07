const LECTURE_PROGRESS_PREFIX = 'smartclass-lecture-progress-v1'

export function lectureProgressKey({ accountId, lectureId, videoId }) {
  return `${LECTURE_PROGRESS_PREFIX}:${accountId}:${lectureId}:${videoId}`
}

function resolveStorage(storage) {
  if (storage) return storage

  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export function readLectureProgress(identity, storage) {
  try {
    const value = resolveStorage(storage)?.getItem(lectureProgressKey(identity))
    if (!/^\d+$/.test(value || '')) return null

    const seconds = Number(value)
    return Number.isSafeInteger(seconds) ? seconds : null
  } catch {
    return null
  }
}

export function writeLectureProgress(identity, seconds, storage) {
  if (!Number.isFinite(seconds) || seconds < 0) return

  try {
    resolveStorage(storage)?.setItem(lectureProgressKey(identity), String(Math.floor(seconds)))
  } catch {
    // Playback remains usable when browser storage is blocked or full.
  }
}

export function removeLectureProgress(identity, storage) {
  try {
    resolveStorage(storage)?.removeItem(lectureProgressKey(identity))
  } catch {
    // Playback remains usable when browser storage is blocked.
  }
}
