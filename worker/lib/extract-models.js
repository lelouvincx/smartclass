// Allowed models for image-based answer extraction (v0.4).
// Shared between worker (allowlist validation) and frontend (model picker UI).
//
// To add a model:
//   1. Append a new entry below.
//   2. Confirm the model id is supported by the configured provider.
//   3. No backend deploy is needed if the provider is `openrouter` —
//      requestAnswersFromImage forwards the model id verbatim.

export const EXTRACT_MODELS = [
  { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast (default)', provider: 'openrouter' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'openrouter' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o-mini', provider: 'openrouter' },
]

export const DEFAULT_EXTRACT_MODEL = 'x-ai/grok-4.1-fast'

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
