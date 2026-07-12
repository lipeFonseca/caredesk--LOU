export const SUPPORTED_IMAGE_ASSET_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]

const ASSET_EXTENSION_REGEX = /\.(png|jpg|jpeg|webp|svg|ico)$/i

export function isSupportedImageAssetType(type) {
  return SUPPORTED_IMAGE_ASSET_TYPES.includes(type)
}

export function extensionForMimeType(type, originalName = '') {
  const byMime = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
  }

  if (byMime[type]) return byMime[type]

  const match = /\.[a-z0-9]+$/i.exec(originalName)
  return match ? match[0].toLowerCase() : ''
}

export async function putImageAsset(bucket, file, { folder, maxSizeMb }) {
  if (!(file instanceof File)) {
    throw new Error('Envie um arquivo valido')
  }

  if (!isSupportedImageAssetType(file.type)) {
    throw new Error('Formato invalido. Use PNG, JPG, SVG, WebP ou ICO')
  }

  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`O arquivo deve ter no maximo ${maxSizeMb} MB`)
  }

  const objectKey = `${folder}/${crypto.randomUUID()}${extensionForMimeType(file.type, file.name)}`

  await bucket.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=86400',
    },
  })

  return { objectKey }
}

export async function deleteAssetIfPresent(bucket, objectKey) {
  if (!bucket || !objectKey) return
  await bucket.delete(objectKey).catch(() => {})
}

export function sanitizeScopedAssetKey(value, allowedFolders) {
  if (!value) return null

  const normalized = decodeURIComponent(value).replace(/^\/+/, '')
  const prefixMatch = allowedFolders.some((folder) => normalized.startsWith(`${folder}/`))
  if (!prefixMatch) return null
  if (!ASSET_EXTENSION_REGEX.test(normalized)) return null

  return normalized
}

export async function buildAssetResponse(bucket, objectKey) {
  const object = await bucket.get(objectKey)
  if (!object) return null

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=86400')
  headers.set('access-control-allow-origin', '*')

  return new Response(object.body, { headers })
}
