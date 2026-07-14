import { Suspense, lazy, useMemo } from 'react'
import { useReducedMotion } from 'framer-motion'

// Lazy: @paper-design/shaders-react (WebGL) so entra no bundle quando o efeito
// realmente renderiza, em vez de pesar no chunk principal do app inteiro.
const LoginPulsingBorderShader = lazy(() => import('./LoginPulsingBorderShader'))

export default function LoginPulsingBorder({ config, className = '', children, radius = 36 }) {
  const prefersReducedMotion = useReducedMotion()
  const isEnabled = Boolean(config?.enabled) && !prefersReducedMotion
  const borderInset = useMemo(() => resolveBorderInset(config), [config])
  const outerRadius = Math.max(0, Number(radius) || 0)
  const innerRadius = Math.max(0, outerRadius - borderInset - 1)

  return (
    <div
      className={`relative overflow-hidden ${className}`.trim()}
      style={{
        borderRadius: `${outerRadius}px`,
        '--login-card-outer-radius': `${outerRadius}px`,
        '--login-card-inner-radius': `${innerRadius}px`,
      }}
    >
      {isEnabled ? (
        <Suspense fallback={null}>
          <LoginPulsingBorderShader config={config} outerRadius={outerRadius} />
        </Suspense>
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

function resolveBorderInset(config = {}) {
  const thickness = typeof config.thickness === 'number' ? config.thickness : 0.1
  const normalized = Math.min(1, Math.max(0, thickness))
  return 4 + (normalized * 8)
}
