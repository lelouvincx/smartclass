const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'google/gemini-2.5-flash'

function buildPrompt(sourceText, expectedQuestionCount) {
  const countHint = expectedQuestionCount
    ? `Expected question count: ${expectedQuestionCount}.`
    : 'Question count is unknown. Parse all questions you can detect.'

  return [
    'Extract an answer schema from this answer key text.',
    'Return JSON only. No markdown, no explanation.',
    'Output format: {"schema":[{"q_id":1,"type":"mcq|boolean|numeric","correct_answer":"...","confidence":0.0-1.0}]}',
    'Rules:',
    '- q_id must be integer question number',
    '- type must be exactly mcq, boolean, or numeric',
    '- mcq answer must be A/B/C/D only',
    '- boolean answer must be true or false only',
    '- numeric answer must be a number string',
    '- if uncertain, still provide best guess and lower confidence',
    countHint,
    '',
    'Answer key text:',
    sourceText,
  ].join('\n')
}

export async function requestSchemaFromOpenRouter(env, sourceText, expectedQuestionCount) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const endpoint = `${env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages: [
        {
          role: 'user',
          content: buildPrompt(sourceText, expectedQuestionCount),
        },
      ],
      temperature: 0.1,
      response_format: {
        type: 'json_object',
      },
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = payload?.error?.message || 'OpenRouter request failed'
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenRouter returned empty content')
  }

  return content
}
