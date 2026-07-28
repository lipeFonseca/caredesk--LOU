import { motion } from 'framer-motion'
import LoginCardLayout from '@/components/LoginCardLayout'
import LoginPulsingBorder from '@/components/ui/LoginPulsingBorder'
import SmokeyBackground from '@/components/SmokeyBackground'
import { getLoginPageBackgroundStyle } from '@/components/login/loginPageBackground'

// Casca das telas publicas (login e redefinicao de senha): fundo, halos, borda
// pulsante e card. Mesma motivacao do LoginCardLayout — enquanto isso viveu
// solto dentro de Login.jsx, qualquer tela publica nova nascia como uma segunda
// arvore JSX paralela e o visual divergia na primeira mudanca de branding.
//
// LIMITACAO: o lugar natural deste arquivo era components/login/, mas essa pasta
// esta com a ACL do Windows quebrada (permissao negada pra criar arquivo novo) e
// a correcao precisa de shell elevado. Mover quando isso for resolvido.
export default function LoginPageShell({ branding, children }) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#091117] px-4 py-8"
      style={getLoginPageBackgroundStyle(branding.loginBackgroundImageUrl)}
    >
      {/* Fundo animado em WebGL. Fica sob tudo; o card é quem recebe o clique. */}
      <SmokeyBackground color={branding.loginBackgroundColor} className="pointer-events-none" />

      {/* Véu escuro sobre o shader: o brilho das ondas passa por baixo do card e
          lavaria o texto branco sem isto. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(6,12,10,0.35),rgba(5,10,9,0.72))]" />

      <LoginPulsingBorder config={branding.loginBorder} radius={36} className="relative w-full max-w-5xl shadow-modal">
        {/* Sem fundo sólido aqui: era `bg-surface-container-low` — quase branco
            no tema claro — e era ELE que o vidro filtrava, não o shader. Com
            fundo transparente o efeito passa a valer de verdade. */}
        <div className="overflow-hidden" style={{ borderRadius: 'inherit' }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <LoginCardLayout branding={branding}>
              {children}
            </LoginCardLayout>
          </motion.div>
        </div>
      </LoginPulsingBorder>
    </div>
  )
}
