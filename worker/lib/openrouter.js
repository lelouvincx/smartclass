const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'x-ai/grok-4.1-fast'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_MODEL = 'gemini-2.5-flash'

const RETRYABLE_PATTERNS = [
  'not available in your region',
  'rate limit',
  'model is currently overloaded',
]

// Vision-capable models cannot fall back to the text-only Gemini path used by
// requestSchemaFromOpenRouter. If the primary call fails, we surface the error
// to the caller, which maps it to a 502 + "switch model / use manual" UX.
// Gemini vision fallback is intentionally deferred to a later PR.

function isRetryableError(message) {
  const lower = (message || '').toLowerCase()
  return RETRYABLE_PATTERNS.some((p) => lower.includes(p))
}

function buildPrompt(sourceText, expectedQuestionCount) {
  const countHint = expectedQuestionCount
    ? `Expected question count: ${expectedQuestionCount}.`
    : 'Question count is unknown. Parse all questions you can detect.'

  return [
    'Extract an answer schema from this answer key text.',
    'Return JSON only. No markdown, no explanation.',
    'Output format: {"schema":[...rows...]}',
    '',
    'Each row must follow one of these formats:',
    '  MCQ:     {"q_id":1,"type":"mcq","correct_answer":"B","confidence":0.9}',
    '  Boolean: {"q_id":2,"type":"boolean","sub_id":"a","correct_answer":"1","confidence":0.9}',
    '  Numeric: {"q_id":3,"type":"numeric","correct_answer":"42","confidence":0.9}',
    '',
    'Rules:',
    '- q_id must be integer question number',
    '- type must be exactly mcq, boolean, or numeric',
    '- mcq correct_answer must be A, B, C, or D only',
    '- boolean questions have 4 sub-questions (a, b, c, d); emit one row per sub-question',
    '- boolean correct_answer must be "1" (true/correct) or "0" (false/incorrect) only',
    '- boolean sub_id must be exactly "a", "b", "c", or "d"',
    '- each boolean q_id must have all 4 sub-questions: a, b, c, d',
    '- numeric correct_answer must be a number string',
    '- if uncertain, still provide best guess and lower confidence score',
    countHint,
    '',
    'Answer key text:',
    sourceText,
  ].join('\n')
}

async function callOpenRouter(endpoint, apiKey, model, messages) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = payload?.error?.message || 'OpenRouter request failed'
    return { ok: false, message }
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    return { ok: false, message: 'OpenRouter returned empty content' }
  }

  return { ok: true, content }
}

async function callGeminiDirect(apiKey, promptText) {
  const endpoint = `${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = payload?.error?.message || 'Gemini API request failed'
    return { ok: false, message }
  }

  const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) {
    return { ok: false, message: 'Gemini API returned empty content' }
  }

  return { ok: true, content }
}

export async function requestSchemaFromOpenRouter(env, sourceText, expectedQuestionCount) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const primaryModel = env.OPENROUTER_MODEL || DEFAULT_MODEL
  const endpoint = `${env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL}/chat/completions`
  const promptText = buildPrompt(sourceText, expectedQuestionCount)
  const messages = [{ role: 'user', content: promptText }]

  const primary = await callOpenRouter(endpoint, env.OPENROUTER_API_KEY, primaryModel, messages)
  if (primary.ok) {
    return primary.content
  }

  if (isRetryableError(primary.message) && env.GEMINI_API_KEY) {
    console.warn(`OpenRouter failed: ${primary.message}. Falling back to direct Gemini API`)
    const fallback = await callGeminiDirect(env.GEMINI_API_KEY, promptText)
    if (fallback.ok) {
      return fallback.content
    }
    throw new Error(fallback.message)
  }

  throw new Error(primary.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision: extract a student's answers from a photo of an answer sheet.
// ─────────────────────────────────────────────────────────────────────────────

function buildAnswersPrompt(schema) {
  // The schema we ship into the prompt is the constrained shape only —
  // (q_id, type, sub_id?). correct_answer is intentionally omitted so the
  // model is never tempted to "fix" a student's wrong answer.
  const compactSchema = schema.map((row) => {
    const out = { q_id: row.q_id, type: row.type }
    if (row.sub_id) out.sub_id = row.sub_id
    return out
  })

  return [
    "You are extracting a student's answers from a photo of an answer sheet.",
    'The exercise has the following questions. For each, return the student\'s answer.',
    '',
    'Schema (do not invent extra rows):',
    JSON.stringify(compactSchema, null, 2),
    '',
    'Output strict JSON only: {"answers":[...]}.',
    'Each row:',
    '  MCQ:     {"q_id":1, "answer":"B", "confidence":0.0-1.0}',
    '  Boolean: {"q_id":2, "sub_id":"a", "answer":"1"|"0", "confidence":...}',
    '  Numeric: {"q_id":3, "answer":"42", "confidence":...}',
    '',
    'Rules:',
    '- Only emit rows whose (q_id, sub_id) appears in the schema above.',
    '- If a question is blank or unreadable, set "answer": null and confidence ≤ 0.3.',
    '- mcq answer must be exactly A, B, C, or D.',
    '- boolean answer must be exactly "1" (true/correct) or "0" (false/incorrect).',
    '- numeric answer must parse as a number (e.g., "42", "3.14", "-1").',
    '- Do not include explanations, markdown, or any text outside the JSON object.',
  ].join('\n')
}

function bytesToBase64(bytes) {
  // ArrayBuffer | Uint8Array → base64. Workers exposes btoa() on globalThis.
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  // Chunk to keep String.fromCharCode(...args) under the JS argument limit.
  const chunk = 0x8000
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Extract a student's answers from an image via an OpenRouter vision model.
 *
 * @param {object}   env               Worker env (uses OPENROUTER_API_KEY, OPENROUTER_BASE_URL).
 * @param {object}   args
 * @param {ArrayBuffer|Uint8Array} args.imageBytes
 * @param {string}   args.contentType  e.g. 'image/jpeg' | 'image/png'
 * @param {Array}    args.schema       answer_schemas rows: { q_id, sub_id, type }
 * @param {string}   args.model        OpenRouter model id (already validated against allowlist)
 * @returns {Promise<string>}          raw JSON text from the model — pass to validateExtractedAnswers
 * @throws {Error}                     when the OpenRouter call fails (no Gemini fallback for vision)
 */
export async function requestAnswersFromImage(env, { imageBytes, contentType, schema, model }) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }
  if (!model) {
    throw new Error('model is required')
  }
  if (!imageBytes) {
    throw new Error('imageBytes is required')
  }
  if (!Array.isArray(schema)) {
    throw new Error('schema must be an array')
  }

  const endpoint = `${env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL}/chat/completions`
  const promptText = buildAnswersPrompt(schema)
  const dataUri = `data:${contentType || 'image/jpeg'};base64,${bytesToBase64(imageBytes)}`

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]

  const result = await callOpenRouter(endpoint, env.OPENROUTER_API_KEY, model, messages)
  if (result.ok) {
    return result.content
  }

  // Vision: no Gemini fallback in PR B — surface error so the route returns 502
  // and the UI prompts the student to retry / switch model / use manual mode.
  throw new Error(result.message)
}
