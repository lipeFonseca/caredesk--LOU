import { useMemo } from 'react'
import { PulsingBorder, pulsingBorderPresets } from '@paper-design/shaders-react'

const PRESET_MAP = {
  default: 'Default',
  circle: 'Circle',
  'northern-lights': 'Northern lights',
  'solid-line': 'Solid line',
}

// Isolado em arquivo proprio (lazy-loaded pelo LoginPulsingBorder) porque
// @paper-design/shaders-react e uma dependencia pesada, usada so quando o
// efeito esta ativo. Manter o import estatico aqui deixaria esse peso fora
// do bundle principal.
export default function LoginPulsingBorderShader({ config, outerRadius }) {
  const shaderProps = useMemo(() => buildShaderProps(config, pulsingBorderPresets, outerRadius), [config, outerRadius])
  if (!shaderProps) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      style={{ borderRadius: `${outerRadius}px` }}
    >
      <PulsingBorder {...shaderProps} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}

function buildShaderProps(config = {}, presets = [], outerRadius = 36) {
  const presetName = PRESET_MAP[config.preset] || PRESET_MAP.default
  const preset = presets.find((candidate) => candidate.name === presetName) || presets[0]
  if (!preset?.params) return null

  const resolvedRoundness = resolveShaderRoundness(config, preset.params.roundness, outerRadius)

  return {
    ...preset.params,
    colors: Array.isArray(config.colors) && config.colors.length ? config.colors : preset.params.colors,
    colorBack: config.colorBack || '#00000000',
    roundness: resolvedRoundness,
    intensity: typeof config.intensity === 'number' ? config.intensity : preset.params.intensity,
    speed: typeof config.speed === 'number' ? config.speed : preset.params.speed,
    thickness: typeof config.thickness === 'number' ? config.thickness : preset.params.thickness,
    bloom: typeof config.bloom === 'number' ? config.bloom : preset.params.bloom,
  }
}

function resolveShaderRoundness(config = {}, presetRoundness = 0.25, outerRadius = 36) {
  const normalizedRadius = Math.min(1, Math.max(0, outerRadius / 96))
  const derivedRoundness = 0.5 + (normalizedRadius * 0.45)
  const presetValue = typeof presetRoundness === 'number' ? presetRoundness : 0.25

  if (config.preset === 'circle') return 1

  return Math.min(1, Math.max(presetValue, derivedRoundness))
}
