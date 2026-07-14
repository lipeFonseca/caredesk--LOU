import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isSupportedImageAssetType,
  extensionForMimeType,
  sanitizeScopedAssetKey,
} from '../src/utils/storage.js'

test('isSupportedImageAssetType accepts only whitelisted mime types', () => {
  assert.equal(isSupportedImageAssetType('image/png'), true)
  assert.equal(isSupportedImageAssetType('image/svg+xml'), true)
  assert.equal(isSupportedImageAssetType('text/html'), false)
  assert.equal(isSupportedImageAssetType('application/javascript'), false)
})

test('extensionForMimeType maps known mime types', () => {
  assert.equal(extensionForMimeType('image/png'), '.png')
  assert.equal(extensionForMimeType('image/jpeg'), '.jpg')
  assert.equal(extensionForMimeType('image/vnd.microsoft.icon'), '.ico')
})

test('extensionForMimeType falls back to the original filename extension', () => {
  assert.equal(extensionForMimeType('application/octet-stream', 'logo.WEBP'), '.webp')
})

test('extensionForMimeType returns empty string when nothing matches', () => {
  assert.equal(extensionForMimeType('application/octet-stream', 'no-extension'), '')
})

test('sanitizeScopedAssetKey accepts a key inside an allowed folder with a valid extension', () => {
  const result = sanitizeScopedAssetKey('branding/logo.png', ['branding', 'avatars'])
  assert.equal(result, 'branding/logo.png')
})

test('sanitizeScopedAssetKey rejects keys outside the allowed folders', () => {
  assert.equal(sanitizeScopedAssetKey('secrets/config.png', ['branding', 'avatars']), null)
})

test('sanitizeScopedAssetKey rejects disallowed extensions (path traversal / non-image payloads)', () => {
  assert.equal(sanitizeScopedAssetKey('branding/../../wrangler.toml', ['branding']), null)
  assert.equal(sanitizeScopedAssetKey('branding/script.js', ['branding']), null)
})

test('sanitizeScopedAssetKey strips a leading slash and decodes URI-encoded input', () => {
  const result = sanitizeScopedAssetKey('/branding%2Flogo.png'.replace('%2F', '/'), ['branding'])
  assert.equal(result, 'branding/logo.png')
})

test('sanitizeScopedAssetKey returns null for empty or falsy input', () => {
  assert.equal(sanitizeScopedAssetKey('', ['branding']), null)
  assert.equal(sanitizeScopedAssetKey(null, ['branding']), null)
  assert.equal(sanitizeScopedAssetKey(undefined, ['branding']), null)
})
