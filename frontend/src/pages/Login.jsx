import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuthStore, useSettingsStore } from '@/store'
import { api } from '@/services/api'
import { getBranding } from '@/theme/branding'
import LoginCardLayout from '@/components/login/LoginCardLayout'
import LoginPulsingBorder from '@/components/ui/LoginPulsingBorder'
import { getLoginPageBackgroundStyle } from '@/components/login/loginPageBackground'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const branding = getBranding(useSettingsStore((state) => state.settings))

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const pageBackgroundStyle = getLoginPageBackgroundStyle(branding.loginBackgroundImageUrl)

  function set(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
      setError('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!form.email || !form.password) {
      setError('Preencha todos os campos.')
      return
    }

    setLoading(true)
    try {
      const data = await api.auth.login(form)
      login(data.token, data.agent)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Credenciais invalidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#091117] px-4 py-8" style={pageBackgroundStyle}>
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
              <div className="w-full max-w-md">
                <div className="relative mb-8 text-center lg:text-left">
                  <img
                    src={branding.logoUrl}
                    alt={`Logo da clinica ${branding.clinicName}`}
                    className="mx-auto h-16 w-16 rounded-[20px] border border-white/12 bg-[rgba(255,255,255,0.10)] object-cover shadow-card lg:mx-0"
                  />
                  <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-[#cfc4d3]">Entrar no painel</p>
                  <h1 className="mt-3 text-display-md text-[#f7f0ea]">{branding.clinicName}</h1>
                  <p className="mt-2 text-sm leading-6 text-[#d4c7c0]">{branding.tagline}</p>
                </div>

                <form onSubmit={handleSubmit} className="relative space-y-5">
                  <div>
                    <label className="label text-[#cec4cf]">Usuario</label>
                    <input
                      type="text"
                      className="input border-white/10 bg-[rgba(35,29,29,0.55)] text-[#f6eee8] placeholder:text-[#ab9faa]"
                      placeholder="nome de usuario"
                      value={form.email}
                      onChange={set('email')}
                      autoFocus
                      autoComplete="username"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="label text-[#cec4cf]">Senha</label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        className="input border-white/10 bg-[rgba(35,29,29,0.55)] pr-10 text-[#f6eee8] placeholder:text-[#ab9faa]"
                        placeholder="••••••••"
                        value={form.password}
                        onChange={set('password')}
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aa9eaa] hover:text-[#f6eee8]"
                      >
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="rounded-2xl bg-error-container/20 px-4 py-3 text-sm text-error"
                    >
                      {error}
                    </motion.p>
                  )}

                  <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <><LogIn size={16} /> Entrar</>
                    )}
                  </button>
                </form>

                <p className="relative mt-7 text-center text-xs uppercase tracking-[0.18em] text-[#cbbfdf] lg:text-left">
                  Cuidado humano com rotina organizada
                </p>
              </div>
            </LoginCardLayout>
          </motion.div>
        </div>
      </LoginPulsingBorder>
    </div>
  )
}
