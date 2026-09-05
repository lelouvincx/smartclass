import { afterEach, describe, expect, it } from 'vitest'
import i18n, {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  changeLanguage,
  getInitialLanguage,
  resources,
} from './index'

function flattenKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'object' ? flattenKeys(child, path) : path
  })
}

afterEach(async () => {
  localStorage.clear()
  await changeLanguage(DEFAULT_LANGUAGE)
})

describe('language preference', () => {
  it('defaults to English without inferring the browser language', () => {
    expect(getInitialLanguage({ getItem: () => null })).toBe('en')
  })

  it('restores only supported saved languages', () => {
    expect(getInitialLanguage({ getItem: () => 'vi' })).toBe('vi')
    expect(getInitialLanguage({ getItem: () => 'fr' })).toBe('en')
  })

  it('persists changes and updates the document language', async () => {
    await changeLanguage('vi')

    expect(i18n.resolvedLanguage).toBe('vi')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('vi')
    expect(document.documentElement.lang).toBe('vi')
  })

  it('falls back to English for unsupported changes', async () => {
    await changeLanguage('fr')

    expect(i18n.resolvedLanguage).toBe('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('keeps English and Vietnamese resource keys in parity', () => {
    const englishKeys = flattenKeys(resources.en.translation).sort()
    const vietnameseKeys = flattenKeys(resources.vi.translation).sort()

    expect(vietnameseKeys).toEqual(englishKeys)
  })

  it('uses the teacher-facing Vietnamese correct-answer label', () => {
    expect(resources.vi.translation.teacher.questionViews.answerReviewTitle).toBe('Kiểm tra đáp án')
    expect(resources.vi.translation.teacher.questionViews.currentAnswer).toBe('Đáp án cuối cùng')
  })

  it('uses the concise Vietnamese save label for exercise activation', () => {
    expect(resources.vi.translation.teacher.questionViews.confirmTitle).toBe('Kiểm tra lần cuối')
    expect(resources.vi.translation.teacher.questionViews.confirmAnswers).toBe('Lưu')
    expect(resources.vi.translation.teacher.questionViews.confirm).toBe('Xác nhận và kích hoạt')
  })

  it('uses concise PDF upload labels without em dashes', () => {
    expect(resources.en.translation.teacher.create.exercisePdf).toBe('Exercise PDF')
    expect(resources.en.translation.teacher.create.answerPdf).toBe('Answer PDF')
    expect(resources.vi.translation.teacher.create.exercisePdf).toBe('PDF đề bài')
    expect(resources.vi.translation.teacher.create.answerPdf).toBe('PDF đáp án')
  })
})
