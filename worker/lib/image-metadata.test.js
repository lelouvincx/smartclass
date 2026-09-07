import { describe, expect, it } from 'vitest'
import { inspectImageFile } from './image-metadata.js'

const IMAGE_FIXTURES = {
  'image/webp': 'UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoDAAIAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA',
  'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGPgEpGDIAY4CwANrAFp+FF+3AAAAABJRU5ErkJggg==',
  'image/jpeg': '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCbAFAH/9k=',
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

describe('inspectImageFile', () => {
  it.each(Object.entries(IMAGE_FIXTURES))(
    'reads the actual format and dimensions of a valid %s file',
    async (mimeType, encoded) => {
      const bytes = decodeBase64(encoded)
      const file = new File([bytes], 'question-image', { type: mimeType })

      const metadata = await inspectImageFile(file)

      expect(metadata).toMatchObject({ mimeType, width: 3, height: 2 })
      expect(metadata.bytes).toEqual(bytes)
    },
  )

  it('rejects image bytes that do not match the declared MIME type', async () => {
    const pngBytes = decodeBase64(IMAGE_FIXTURES['image/png'])
    const file = new File([pngBytes], 'question.webp', { type: 'image/webp' })

    await expect(inspectImageFile(file)).rejects.toThrow('does not match')
  })

  it('rejects malformed image bytes', async () => {
    const file = new File([new Uint8Array(64).fill(0xab)], 'question.webp', {
      type: 'image/webp',
    })

    await expect(inspectImageFile(file)).rejects.toThrow('valid PNG, JPEG, or WebP')
  })
})
