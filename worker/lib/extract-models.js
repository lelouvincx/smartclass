// Allowed models for image-based answer extraction (v0.4).
// Shared between worker (allowlist validation) and frontend (model picker UI).
//
// To add a model:
//   1. Append a new entry below.
//   2. Confirm the model id is supported by the configured provider.
//   3. No backend deploy is needed if the provider is `openrouter` —
//      requestAnswersFromImage forwards the model id verbatim.

export const EXTRACT_MODELS = [
  { id: 'mistralai/mistral-small-3.2-24b-instruct', label: 'Mistral Small 3.2 (default)', provider: 'openrouter' },
  { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast', provider: 'openrouter' },
]

export const DEFAULT_EXTRACT_MODEL = 'mistralai/mistral-small-3.2-24b-instruct'

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
