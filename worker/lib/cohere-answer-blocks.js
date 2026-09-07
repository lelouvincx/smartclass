import { parseImageBlocksWithCohere } from './cohere.js'
import { parseAnswerPdfBlockPages } from './cohere-table-parser.js'

export async function parseAnswerPdfImagesWithCohereBlocks(env, pages, options = {}) {
  if (!Array.isArray(pages)) throw new TypeError('pages must be an array')

  const parsedPages = await Promise.all(pages.map(async (page) => {
    const result = await parseImageBlocksWithCohere(env, {
      imageBytes: page?.imageBytes,
      contentType: page?.contentType,
      signal: page?.signal,
      requireTableBlock: false,
    })

    return {
      page_number: page?.page_number,
      text: page?.text,
      blocks: result.blocks,
      provider_ms: result.provider_ms,
      billed_pages: result.billed_pages,
    }
  }))

  const parsed = parseAnswerPdfBlockPages(parsedPages, options)
  return {
    ...parsed,
    billed_pages: parsedPages.reduce((total, page) => total + page.billed_pages, 0),
    provider_ms: parsedPages.reduce((total, page) => total + page.provider_ms, 0),
  }
}
