import { describe, it, expect } from 'vitest'
import { EXTRACT_MODELS, DEFAULT_EXTRACT_MODEL, resolveModel } from './extract-models.js'

describe('extract-models', () => {
  it('exposes a non-empty model list', () => {
    expect(EXTRACT_MODELS.length).toBeGreaterThan(0)
    for (const m of EXTRACT_MODELS) {
      expect(m).toMatchObject({
        id: expect.any(String),
        label: expect.any(String),
        provider: expect.any(String),
      })
    }
  })

  it('default model is in the allowlist', () => {
    expect(EXTRACT_MODELS.some((m) => m.id === DEFAULT_EXTRACT_MODEL)).toBe(true)
  })

  describe('resolveModel', () => {
    it('returns the requested id when it is in the allowlist', () => {
      for (const m of EXTRACT_MODELS) {
        expect(resolveModel(m.id)).toBe(m.id)
      }
    })

    it('falls back to default for unknown ids', () => {
      expect(resolveModel('made-up/model')).toBe(DEFAULT_EXTRACT_MODEL)
    })

    it('falls back to default for null/undefined/non-strings', () => {
      expect(resolveModel(null)).toBe(DEFAULT_EXTRACT_MODEL)
      expect(resolveModel(undefined)).toBe(DEFAULT_EXTRACT_MODEL)
      expect(resolveModel(42)).toBe(DEFAULT_EXTRACT_MODEL)
      expect(resolveModel('')).toBe(DEFAULT_EXTRACT_MODEL)
    })
  })
})
