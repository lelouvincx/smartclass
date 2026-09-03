import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from '@/locales/en/common'
import enSettings from '@/locales/en/settings'
import enStudent from '@/locales/en/student'
import enTeacher from '@/locales/en/teacher'
import viCommon from '@/locales/vi/common'
import viSettings from '@/locales/vi/settings'
import viStudent from '@/locales/vi/student'
import viTeacher from '@/locales/vi/teacher'

export const DEFAULT_LANGUAGE = 'en'
export const SUPPORTED_LANGUAGES = ['en', 'vi']
export const LANGUAGE_STORAGE_KEY = 'smartclass-language-v1'

export const resources = {
  en: {
    translation: {
      common: enCommon,
      settings: enSettings,
      student: enStudent,
      teacher: enTeacher,
    },
  },
  vi: {
    translation: {
      common: viCommon,
      settings: viSettings,
      student: viStudent,
      teacher: viTeacher,
    },
  },
}

export function getInitialLanguage(storage = globalThis.localStorage) {
  const savedLanguage = storage?.getItem?.(LANGUAGE_STORAGE_KEY)
  return SUPPORTED_LANGUAGES.includes(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE
}

const initialLanguage = getInitialLanguage()

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    initImmediate: false,
    showSupportNotice: false,
  })

if (globalThis.document) {
  document.documentElement.lang = initialLanguage
}

export async function changeLanguage(language) {
  const nextLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE
  globalThis.localStorage?.setItem?.(LANGUAGE_STORAGE_KEY, nextLanguage)
  await i18n.changeLanguage(nextLanguage)
  if (globalThis.document) document.documentElement.lang = nextLanguage
}

export default i18n
