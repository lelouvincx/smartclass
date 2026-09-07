const DEFAULT_BASE_URL = 'https://api.cohere.com'
const DEFAULT_TIMEOUT_MS = 15_000

export const COHERE_MODEL = 'parse-v5.0'

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    binary += String.fromCharCode.apply(null, view.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function hasHtmlTable(markdown) {
  return /<table\b[^>]*>[\s\S]*?<\/table>/i.test(markdown)
}

async function requestImageParse(env, {
  imageBytes,
  contentType,
  signal: callerSignal,
  outputFormat,
}) {
  if (!env?.COHERE_API_KEY) {
    throw new Error('COHERE_API_KEY is not configured')
  }
  if (!(imageBytes instanceof ArrayBuffer) && !ArrayBuffer.isView(imageBytes)) {
    throw new Error('imageBytes is required')
  }

  const controller = new AbortController()
  let abortSource = null
  let rejectAbort
  const aborted = new Promise((resolve, reject) => {
    rejectAbort = reject
  })
  const abortFromCaller = () => {
    abortSource = 'caller'
    controller.abort()
    rejectAbort(new Error('Cohere Parse request was cancelled'))
  }
  if (callerSignal?.aborted) abortFromCaller()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

  const configuredTimeoutMs = Number(env.COHERE_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : DEFAULT_TIMEOUT_MS
  const timeout = setTimeout(() => {
    abortSource = 'timeout'
    controller.abort()
    rejectAbort(new Error('Cohere Parse request timed out'))
  }, timeoutMs)

  const started = performance.now()
  let response
  let payload
  try {
    const baseUrl = String(env.COHERE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
    response = await Promise.race([fetch(`${baseUrl}/v2/parse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        document: {
          type: 'image_url',
          image_url: `data:${contentType || 'image/jpeg'};base64,${bytesToBase64(imageBytes)}`,
        },
        output_format: outputFormat,
      }),
      signal: controller.signal,
    }), aborted])
    if (!response.ok) {
      throw new Error(`Cohere Parse request failed with status ${response.status}`)
    }
    payload = await Promise.race([response.json().catch(() => null), aborted])
  } catch {
    if (abortSource === 'timeout') throw new Error('Cohere Parse request timed out')
    if (abortSource === 'caller') throw new Error('Cohere Parse request was cancelled')
    if (response && !response.ok) {
      throw new Error(`Cohere Parse request failed with status ${response.status}`)
    }
    throw new Error('Cohere Parse request failed')
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }

  const providerMs = Math.round(performance.now() - started)
  return { payload, providerMs }
}

export async function parseImageWithCohere(env, {
  imageBytes,
  contentType,
  signal: callerSignal,
  requireHtmlTable = true,
}) {
  const { payload, providerMs } = await requestImageParse(env, {
    imageBytes,
    contentType,
    signal: callerSignal,
    outputFormat: 'markdown',
  })
  const markdown = payload?.pages?.[0]?.markdown?.content
  const billedPages = payload?.meta?.billed_units?.pages
  if (typeof markdown !== 'string' || !Number.isFinite(billedPages)) {
    throw new Error('Cohere Parse returned a malformed response')
  }
  if (requireHtmlTable && !hasHtmlTable(markdown)) {
    throw new Error('Cohere Parse returned no HTML table')
  }

  return {
    markdown,
    provider_ms: providerMs,
    billed_pages: billedPages,
  }
}

export async function parseImageBlocksWithCohere(env, {
  imageBytes,
  contentType,
  signal: callerSignal,
  requireTableBlock = true,
}) {
  const { payload, providerMs } = await requestImageParse(env, {
    imageBytes,
    contentType,
    signal: callerSignal,
    outputFormat: 'blocks',
  })
  const blocks = payload?.pages?.[0]?.blocks
  const billedPages = payload?.meta?.billed_units?.pages
  if (!Array.isArray(blocks) || !Number.isFinite(billedPages)) {
    throw new Error('Cohere Parse returned a malformed response')
  }
  if (requireTableBlock && !blocks.some(block => block?.type === 'table'
    && (!block.table?.type || block.table.type === 'html')
    && typeof block.table?.html === 'string')) {
    throw new Error('Cohere Parse returned no table block')
  }

  return {
    blocks,
    provider_ms: providerMs,
    billed_pages: billedPages,
  }
}
