import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import i18n from '@/i18n'

beforeEach(() => i18n.changeLanguage('en'))

// Polyfill ResizeObserver for Radix UI components (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
