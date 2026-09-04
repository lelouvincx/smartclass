export function groupLectureRuns(lectures) {
  return lectures.reduce((groups, lecture) => {
    const currentGroup = groups.at(-1)
    if (currentGroup?.name === lecture.section_name) {
      currentGroup.lectures.push(lecture)
    } else {
      groups.push({ name: lecture.section_name, lectures: [lecture] })
    }
    return groups
  }, [])
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (character) => (character === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getLecturePath(lecture) {
  const titleSlug = slugify(lecture.title) || 'lecture'
  return `/student/lectures/${lecture.id}-${titleSlug}`
}

export function getLectureIdFromSlug(value) {
  const match = /^(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(value || '')
  return match ? Number(match[1]) : null
}

export function getYouTubeVideoId(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    let videoId = null

    if (url.protocol !== 'https:') return null
    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0]
    } else if (hostname === 'youtube.com') {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v')
      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/').filter(Boolean)[1]
      }
    }

    if (!/^[\w-]{11}$/.test(videoId || '')) return null
    return videoId
  } catch {
    return null
  }
}

export function getYouTubeEmbedUrl(value, { enableJsApi = false, origin, startSeconds } = {}) {
  const videoId = getYouTubeVideoId(value)
  if (!videoId) return null

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`
  if (!enableJsApi && !origin && !Number.isFinite(startSeconds)) return embedUrl

  const url = new URL(embedUrl)
  if (enableJsApi) url.searchParams.set('enablejsapi', '1')
  if (enableJsApi && origin) url.searchParams.set('origin', origin)
  if (Number.isFinite(startSeconds) && startSeconds > 0) {
    url.searchParams.set('start', String(Math.floor(startSeconds)))
  }
  return url.toString()
}
