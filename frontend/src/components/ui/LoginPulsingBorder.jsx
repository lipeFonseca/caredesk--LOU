import { Suspense, lazy, useMemo } from 'react'
import { useReducedMotion } from 'framer-motion'
import { LOGIN_BORDER_MAX } from '@/theme/branding'

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
      {/* Sem fundo próprio: `bg-surface` é branco no tema claro e era ELE que o
          vidro do card filtrava — o efeito nunca alcançava o fundo animado.
          Quem pinta as duas colunas é o LoginCardLayout. */}
      <div
        className="relative z-10 border border-white/15 bg-transparent"
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

// Margem entre a borda e o card. Acompanha a espessura na escala inteira: com o
// clamp antigo em 1, qualquer valor acima disso dava a mesma margem e a borda
// passava a invadir o card em vez de crescer para fora.
function resolveBorderInset(config = {}) {
  const thickness = typeof config.thickness === 'number' ? config.thickness : 0.1
  const normalized = Math.min(LOGIN_BORDER_MAX, Math.max(0, thickness)) / LOGIN_BORDER_MAX
  return 4 + (normalized * 22)
}
