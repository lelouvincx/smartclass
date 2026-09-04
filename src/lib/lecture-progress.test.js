import {
  lectureProgressKey,
  readLectureProgress,
  removeLectureProgress,
  writeLectureProgress,
} from './lecture-progress'

const identity = { accountId: 7, lectureId: 12, videoId: 'abcdefghijk' }

describe('lecture progress storage', () => {
  beforeEach(() => localStorage.clear())

  it('isolates a whole-second position by account, lecture, and video', () => {
    writeLectureProgress(identity, 42.9)

    expect(readLectureProgress(identity)).toBe(42)
    expect(readLectureProgress({ ...identity, accountId: 8 })).toBeNull()
    expect(readLectureProgress({ ...identity, lectureId: 13 })).toBeNull()
    expect(readLectureProgress({ ...identity, videoId: 'lmnopqrstuv' })).toBeNull()
  })

  it('rejects malformed and invalid stored positions', () => {
    const key = lectureProgressKey(identity)

    for (const value of ['', '-1', '1.5', 'Infinity', 'not-a-number']) {
      localStorage.setItem(key, value)
      expect(readLectureProgress(identity)).toBeNull()
    }
  })

  it('removes saved progress', () => {
    writeLectureProgress(identity, 42)
    removeLectureProgress(identity)

    expect(readLectureProgress(identity)).toBeNull()
  })

  it('fails open when storage access throws', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }

    expect(readLectureProgress(identity, storage)).toBeNull()
    expect(() => writeLectureProgress(identity, 42, storage)).not.toThrow()
    expect(() => removeLectureProgress(identity, storage)).not.toThrow()
  })
})
