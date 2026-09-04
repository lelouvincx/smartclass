// Official DeepSeek models allowed for image-based answer extraction.
// Shared between worker (allowlist validation) and frontend (model picker UI).

export const EXTRACT_MODELS = [
  { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision (default)', provider: 'deepseek' },
]

export const DEFAULT_EXTRACT_MODEL = 'deepseek-v4-flash-vision-exp'

const MODEL_IDS = new Set(EXTRACT_MODELS.map((m) => m.id))

/**
 * Resolve a model id to one in the allowlist.
 * Returns the requested id if valid, otherwise the default.
 * Always returns a model id from EXTRACT_MODELS — never throws.
 */
export function resolveModel(requested) {
  if (typeof requested === 'string' && MODEL_IDS.has(requested)) {
    return requested
  }
  return DEFAULT_EXTRACT_MODEL
}

/**
 * Strict check used by exercise create/update — rejects unknown ids so the
 * teacher gets a clear 400 instead of a silent fallback.
 */
export function isValidExtractModel(id) {
  return typeof id === 'string' && MODEL_IDS.has(id)
}
