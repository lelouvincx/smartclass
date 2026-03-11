let pdfjsPromise

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }

  return pdfjsPromise
}

export async function extractTextFromPdf(file) {
  const pdfjs = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)
  const pdf = await pdfjs.getDocument({ data }).promise

  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    pages.push(text)
  }

  return pages.join('\n').trim()
}
