export function normalizeHex(hex) {
  if (typeof hex !== 'string') return null
  const value = hex.trim()
  return /^#([0-9a-f]{6})$/i.test(value) ? value : null
}

export function mix(baseHex, targetHex, amount) {
  const [r1, g1, b1] = hexToRgb(baseHex)
  const [r2, g2, b2] = hexToRgb(targetHex)

  return rgbToHex(
    interpolate(r1, r2, amount),
    interpolate(g1, g2, amount),
    interpolate(b1, b2, amount)
  )
}

export function interpolate(a, b, amount) {
  return Math.round(a + (b - a) * amount)
}

export function hexToRgb(hex) {
  const normalized = normalizeHex(hex)
  if (!normalized) return [0, 0, 0]

  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ]
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgbTriplet(hex) {
  const [r, g, b] = hexToRgb(hex)
  return `${r} ${g} ${b}`
}
