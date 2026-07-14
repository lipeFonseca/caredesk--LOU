import { describe, it, expect } from 'vitest'
import {
  normalizeBrandingSettings,
  getBranding,
  sanitizePrimaryColor,
  sanitizeBrandUrl,
  sanitizeColorString,
  buildInitialsLogo,
  DEFAULT_LOGIN_BORDER_COLORS,
} from './branding'

describe('sanitizePrimaryColor', () => {
  it('accepts a valid 6-digit hex color', () => {
    expect(sanitizePrimaryColor('#123abc')).toBe('#123abc')
  })

  it('falls back to the default for invalid input', () => {
    expect(sanitizePrimaryColor('not-a-color')).toBe('#5f8fba')
    expect(sanitizePrimaryColor('')).toBe('#5f8fba')
    expect(sanitizePrimaryColor(undefined)).toBe('#5f8fba')
  })
})

describe('sanitizeBrandUrl', () => {
  it('allows http/https URLs', () => {
    expect(sanitizeBrandUrl('https://example.com/logo.png')).toBe('https://example.com/logo.png')
  })

  it('allows data:image URIs verbatim', () => {
    const uri = 'data:image/svg+xml;base64,abc123'
    expect(sanitizeBrandUrl(uri)).toBe(uri)
  })

  it('rejects javascript: and other unsafe schemes', () => {
    expect(sanitizeBrandUrl('javascript:alert(1)')).toBe('')
  })

  it('rejects malformed URLs and empty input', () => {
    expect(sanitizeBrandUrl('not a url')).toBe('')
    expect(sanitizeBrandUrl('')).toBe('')
    expect(sanitizeBrandUrl(undefined)).toBe('')
  })
})

describe('sanitizeColorString', () => {
  it('accepts 3/4/6/8-digit hex colors', () => {
    expect(sanitizeColorString('#fff')).toBe('#fff')
    expect(sanitizeColorString('#ffff')).toBe('#ffff')
    expect(sanitizeColorString('#ffffff')).toBe('#ffffff')
    expect(sanitizeColorString('#ffffffff')).toBe('#ffffffff')
  })

  it('falls back on invalid input', () => {
    expect(sanitizeColorString('red', '#000000')).toBe('#000000')
    expect(sanitizeColorString('', '#abcdef')).toBe('#abcdef')
  })
})

describe('normalizeBrandingSettings', () => {
  it('produces safe defaults from empty input', () => {
    const normalized = normalizeBrandingSettings({})
    expect(normalized.clinic_name).toBe('')
    expect(normalized.primary_color).toBe('#5f8fba')
    expect(normalized.login_border_preset).toBe('default')
    expect(normalized.login_border_color_1).toBe(DEFAULT_LOGIN_BORDER_COLORS[0])
    expect(normalized.login_border_intensity).toBe(0.2)
    expect(normalized.timezone).toBe('America/Fortaleza')
  })

  it('clamps numeric fields into their valid range', () => {
    const normalized = normalizeBrandingSettings({
      login_border_intensity: 5,
      login_border_speed: -3,
    })
    expect(normalized.login_border_intensity).toBe(1)
    expect(normalized.login_border_speed).toBe(0)
  })

  it('rejects unknown login_border_preset values', () => {
    const normalized = normalizeBrandingSettings({ login_border_preset: 'not-a-preset' })
    expect(normalized.login_border_preset).toBe('default')
  })

  it('coerces booleanish values for login_border_effect_enabled', () => {
    expect(normalizeBrandingSettings({ login_border_effect_enabled: '1' }).login_border_effect_enabled).toBe(true)
    expect(normalizeBrandingSettings({ login_border_effect_enabled: 'true' }).login_border_effect_enabled).toBe(true)
    expect(normalizeBrandingSettings({ login_border_effect_enabled: '0' }).login_border_effect_enabled).toBe(false)
    expect(normalizeBrandingSettings({ login_border_effect_enabled: false }).login_border_effect_enabled).toBe(false)
  })
})

describe('getBranding', () => {
  it('falls back to default clinic name, tagline and generated logo', () => {
    const branding = getBranding({})
    expect(branding.clinicName).toBe('CareDesk')
    expect(branding.tagline).toContain('Acompanhamento')
    expect(branding.logoUrl.startsWith('data:image/svg+xml')).toBe(true)
    expect(branding.faviconUrl).toBe(branding.logoUrl)
  })

  it('uses provided branding fields when present', () => {
    const branding = getBranding({
      clinic_name: 'Clinica Teste',
      logo_url: 'https://example.com/logo.png',
      favicon_url: 'https://example.com/favicon.png',
    })
    expect(branding.clinicName).toBe('Clinica Teste')
    expect(branding.logoUrl).toBe('https://example.com/logo.png')
    expect(branding.faviconUrl).toBe('https://example.com/favicon.png')
  })

  it('falls back to default login border colors when none are set', () => {
    const branding = getBranding({})
    expect(branding.loginBorder.colors).toEqual(DEFAULT_LOGIN_BORDER_COLORS)
  })
})

describe('buildInitialsLogo', () => {
  it('extracts up to two initials from the clinic name', () => {
    const svg = buildInitialsLogo('Clinica Boa Saude')
    const decoded = decodeURIComponent(svg.replace('data:image/svg+xml;charset=UTF-8,', ''))
    expect(decoded).toContain('>CB<')
  })

  it('falls back to a single "C" for empty names', () => {
    const svg = buildInitialsLogo('')
    const decoded = decodeURIComponent(svg.replace('data:image/svg+xml;charset=UTF-8,', ''))
    expect(decoded).toContain('>C<')
  })
})
