const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'x-ai/grok-4.1-fast'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_MODEL = 'gemini-2.5-flash'

const RETRYABLE_PATTERNS = [
  'not available in your region',
  'rate limit',
  'model is currently overloaded',
]

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
