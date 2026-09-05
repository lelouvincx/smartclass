const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const SCHEMA_MODEL = 'deepseek-v4-flash'

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
    '  MCQ:     {"q_id":1,"section_key":"section-1","section_title":"Phần I","local_number":1,"type":"mcq","correct_answer":"B","confidence":0.9}',
    '  Boolean: {"q_id":2,"section_key":"section-1","section_title":"Phần I","local_number":2,"type":"boolean","sub_id":"a","correct_answer":"1","confidence":0.9}',
    '  Numeric: {"q_id":3,"section_key":"section-2","section_title":"Phần II","local_number":1,"type":"numeric","correct_answer":"42","confidence":0.9}',
    '',
    'Rules:',
    '- Assign q_id as a positive global slot in document order, starting at 1; repeated boolean subrows share one q_id',
    '- assign section_key as section-1, section-2, and so on in section first-appearance order',
    '- Preserve each Unicode section title exactly in section_title; use null when no title is present',
    '- local_number is the positive question number shown within the section and local_number resets to 1 in each section',
    '- every row must include q_id, section_key, section_title, and local_number',
    '- (section_key, local_number) and q_id must map one-to-one; a local_number may repeat only across different sections',
    '- type must be exactly mcq, boolean, or numeric',
    '- when known, mcq correct_answer must be A, B, C, or D only',
    '- boolean questions have 4 sub-questions (a, b, c, d); emit one row per sub-question',
    '- when known, boolean correct_answer must be "1" (true/correct) or "0" (false/incorrect) only',
    '- boolean sub_id must be exactly "a", "b", "c", or "d"',
    '- each boolean q_id must have all 4 sub-questions: a, b, c, d',
    '- all rows for one boolean question must share q_id, section_key, section_title, local_number, and type',
    '- when known, numeric correct_answer must be a number string',
    '- if uncertain, use an empty correct_answer and confidence at or below 0.3; do not guess',
    countHint,
    '',
    'Answer key text:',
    sourceText,
  ].join('\n')
}

async function callDeepSeek(endpoint, apiKey, model, messages) {
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
    const message = payload?.error?.message || 'DeepSeek request failed'
    return { ok: false, message }
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    return { ok: false, message: 'DeepSeek returned empty content' }
  }

  return { ok: true, content }
}

export async function requestSchemaFromDeepSeek(env, sourceText, expectedQuestionCount) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured')
  }

  const endpoint = `${env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL}/chat/completions`
  const promptText = buildPrompt(sourceText, expectedQuestionCount)
  const messages = [{ role: 'user', content: promptText }]

  const result = await callDeepSeek(endpoint, env.DEEPSEEK_API_KEY, SCHEMA_MODEL, messages)
  if (result.ok) {
    return result.content
  }

  throw new Error(result.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision: extract a student's answers from a photo of an answer sheet.
// ─────────────────────────────────────────────────────────────────────────────

function buildAnswersPrompt(schema) {
  // The schema we ship into the prompt is the constrained shape only —
  // Identity and type only. correct_answer is intentionally omitted so the
  // model is never tempted to "fix" a student's wrong answer.
  const compactSchema = schema.map((row) => {
    const out = {
      q_id: row.q_id,
      section_key: row.section_key ?? 'main',
      section_title: row.section_title ?? null,
      local_number: row.local_number ?? row.q_id,
      type: row.type,
    }
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
    '- Use section_title and local_number to map repeated source question numbers to q_id.',
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
 * Extract a student's answers with DeepSeek's official vision API.
 *
 * @param {object}   env               Worker env (uses DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL).
 * @param {object}   args
 * @param {ArrayBuffer|Uint8Array} args.imageBytes
 * @param {string}   args.contentType  e.g. 'image/jpeg' | 'image/png'
 * @param {Array}    args.schema       answer_schemas rows: { q_id, sub_id, type }
 * @param {string}   args.model        DeepSeek model id (already validated against allowlist)
 * @returns {Promise<string>}          raw JSON text from the model — pass to validateExtractedAnswers
 * @throws {Error}                     when the DeepSeek call fails
 */
export async function requestAnswersFromImage(env, { imageBytes, contentType, schema, model }) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured')
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

  const endpoint = `${env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL}/chat/completions`
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

  const result = await callDeepSeek(endpoint, env.DEEPSEEK_API_KEY, model, messages)
  if (result.ok) {
    return result.content
  }

  throw new Error(result.message)
}
