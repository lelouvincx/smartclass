import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Set WEB_ROOT=dist to run the same contract against the production build.
const root = new URL(`../${process.env.WEB_ROOT || ''}/`, import.meta.url)
const assets = process.env.WEB_ROOT ? root : new URL('../public/', import.meta.url)

test('home-screen metadata launches the current site standalone with valid PNG icons', () => {
  const document = new JSDOM(readFileSync(new URL('index.html', root), 'utf8')).window.document
  const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute('href')
  assert.equal(manifestHref, '/manifest.webmanifest')
  const manifest = JSON.parse(readFileSync(new URL(manifestHref.slice(1), assets), 'utf8'))
  assert.equal(manifest.name, 'SmartClass')
  assert.equal(manifest.short_name, 'SmartClass')
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.prefer_related_applications, false)
  assert.equal(manifest.theme_color, '#2563EB')
  assert.equal(manifest.background_color, '#F8FAFC')
  assert.equal(document.querySelector('meta[name="theme-color"]')?.content, manifest.theme_color)

  function checkPng(src, size) {
    assert.match(src, /^\/icons\/[^/]+\.png$/)
    const bytes = readFileSync(new URL(src.slice(1), assets))
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR')
    assert.equal(bytes.readUInt32BE(16), size)
    assert.equal(bytes.readUInt32BE(20), size)
  }

  for (const size of [192, 512]) {
    const icon = manifest.icons.find((candidate) => candidate.sizes === `${size}x${size}`)
    assert.ok(icon, `${size}px install icon is present`)
    assert.equal(icon.type, 'image/png')
    assert.equal(icon.purpose, 'any maskable')
    checkPng(icon.src, size)
  }
  checkPng(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), 180)
  checkPng(document.querySelector('link[rel="icon"]')?.getAttribute('href'), 192)
})
