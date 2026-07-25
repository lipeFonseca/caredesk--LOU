import { motion } from 'framer-motion'
import LoginCardLayout from '@/components/login/LoginCardLayout'
import LoginPulsingBorder from '@/components/ui/LoginPulsingBorder'
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(255,255,255,0.04),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_24%,transparent_72%,rgba(255,255,255,0.03))]" />
      <div className="absolute inset-x-[14%] bottom-[-12%] top-[58%] rounded-full bg-[radial-gradient(circle,rgba(46,121,173,0.16),rgba(46,121,173,0.06)_38%,transparent_72%)] blur-3xl" />
      <div className="absolute left-[-12%] top-[10%] h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,rgba(109,154,194,0.18),transparent_70%)] blur-3xl" />
      <div className="absolute right-[-10%] top-[18%] h-[16rem] w-[16rem] rounded-full bg-[radial-gradient(circle,rgba(124,92,162,0.12),transparent_72%)] blur-3xl" />

      <LoginPulsingBorder config={branding.loginBorder} radius={36} className="w-full max-w-5xl shadow-modal">
        <div className="overflow-hidden bg-surface-container-low" style={{ borderRadius: 'inherit' }}>
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
