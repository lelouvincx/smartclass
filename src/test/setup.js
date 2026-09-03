import '@testing-library/jest-dom/vitest'
import '@/i18n'

// Polyfill ResizeObserver for Radix UI components (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
