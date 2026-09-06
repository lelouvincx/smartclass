import {
  getLectureIdFromSlug,
  getLecturePath,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
  groupLectureRuns,
} from './lectures'

const lectures = [
  { id: 1, title: 'Introduction', section_name: 'Chapter 1' },
  { id: 2, title: 'Worked example', section_name: 'Chapter 1' },
  { id: 3, title: 'Functions', section_name: 'Chapter 2' },
  { id: 4, title: 'Review', section_name: 'Chapter 1' },
]

describe('lecture helpers', () => {
  it('groups only consecutive lectures with the same section name', () => {
    expect(groupLectureRuns(lectures)).toEqual([
      { name: 'Chapter 1', lectures: lectures.slice(0, 2) },
      { name: 'Chapter 2', lectures: lectures.slice(2, 3) },
      { name: 'Chapter 1', lectures: lectures.slice(3, 4) },
    ])
  })

  it('builds a readable lecture URL with a stable id', () => {
    expect(getLecturePath({ id: 5, title: 'Understanding linear equations' }))
      .toBe('/student/lectures/5-understanding-linear-equations')
    expect(getLecturePath({ id: 6, title: 'Đồ thị và hàm số' }))
      .toBe('/student/lectures/6-do-thi-va-ham-so')
  })

  it('reads the stable id from a lecture slug', () => {
    expect(getLectureIdFromSlug('5-understanding-linear-equations')).toBe(5)
    expect(getLectureIdFromSlug('understanding-linear-equations')).toBeNull()
  })

  it.each([
    ['https://youtu.be/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk'],
    ['https://www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk'],
    ['https://youtube.com/shorts/abcdefghijk', 'https://www.youtube-nocookie.com/embed/abcdefghijk'],
  ])('builds a privacy-enhanced embed URL from %s', (url, expected) => {
    expect(getYouTubeEmbedUrl(url)).toBe(expected)
  })

  it('returns null for an unsupported YouTube URL', () => {
    expect(getYouTubeEmbedUrl('https://youtube.com/channel/abcdefghijk')).toBeNull()
  })

  it('returns the canonical video id used by embeds and progress storage', () => {
    expect(getYouTubeVideoId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk')
    expect(getYouTubeVideoId('https://youtube.com/channel/abcdefghijk')).toBeNull()
  })

  it('adds optional student-player parameters without changing the default URL', () => {
    expect(getYouTubeEmbedUrl('https://youtu.be/abcdefghijk', {
      enableJsApi: true,
      origin: 'https://smartclass.example',
      startSeconds: 42.9,
    })).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?enablejsapi=1&origin=https%3A%2F%2Fsmartclass.example&start=42')
    expect(getYouTubeEmbedUrl('https://youtu.be/abcdefghijk'))
      .toBe('https://www.youtube-nocookie.com/embed/abcdefghijk')
  })
})
