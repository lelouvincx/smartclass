import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(`${process.cwd()}/index.html`, 'utf8')
const tokensCss = readFileSync(`${process.cwd()}/src/design-system/tokens.css`, 'utf8')

describe('design-system typography', () => {
  it('loads and applies the Inter typeface', () => {
    expect(indexHtml).toContain('fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap')
    expect(tokensCss).toContain("--sc-font-family: 'Inter', 'Noto Sans', sans-serif;")
  })
})
