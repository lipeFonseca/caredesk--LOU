import { useMemo } from 'react'
import { useReducedMotion } from 'framer-motion'
import { PulsingBorder, pulsingBorderPresets } from '@paper-design/shaders-react'

const PRESET_MAP = {
  default: 'Default',
  circle: 'Circle',
  'northern-lights': 'Northern lights',
  'solid-line': 'Solid line',
}

export default function LoginPulsingBorder({ config, className = '', children, radius = 36 }) {
  const prefersReducedMotion = useReducedMotion()
  const isEnabled = Boolean(config?.enabled) && !prefersReducedMotion
  const shaderProps = useMemo(() => buildShaderProps(config, pulsingBorderPresets), [config])
  const borderInset = useMemo(() => resolveBorderInset(config), [config])
  const outerRadius = Math.max(0, Number(radius) || 0)
  const innerRadius = Math.max(0, outerRadius - borderInset - 1)

  return (
    <div
      className={`relative overflow-hidden ${className}`.trim()}
      style={{ borderRadius: `${outerRadius}px` }}
    >
      {isEnabled && shaderProps ? (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
          style={{ borderRadius: `${outerRadius}px` }}
        >
          <PulsingBorder {...shaderProps} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      ) : null}
      <div
        className="relative z-10 border border-outline-variant/60 bg-surface"
        style={{
          borderRadius: `${innerRadius}px`,
          ...(isEnabled ? { margin: `${borderInset}px` } : undefined),
        }}
      >
        {children}
      </div>
    </div>
  )
}

function buildShaderProps(config = {}, presets = []) {
  const presetName = PRESET_MAP[config.preset] || PRESET_MAP.default
  const preset = presets.find((candidate) => candidate.name === presetName) || presets[0]
  if (!preset?.params) return null

  return {
    ...preset.params,
    colors: Array.isArray(config.colors) && config.colors.length ? config.colors : preset.params.colors,
    colorBack: config.colorBack || '#00000000',
    intensity: typeof config.intensity === 'number' ? config.intensity : preset.params.intensity,
    speed: typeof config.speed === 'number' ? config.speed : preset.params.speed,
    thickness: typeof config.thickness === 'number' ? config.thickness : preset.params.thickness,
    bloom: typeof config.bloom === 'number' ? config.bloom : preset.params.bloom,
  }
}

function resolveBorderInset(config = {}) {
  const thickness = typeof config.thickness === 'number' ? config.thickness : 0.1
  const normalized = Math.min(1, Math.max(0, thickness))
  return 4 + (normalized * 8)
}
