import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import { useAuthStore, useSettingsStore } from '@/store'
import { api } from '@/services/api'
import { getBranding } from '@/theme/branding'
import LoginPageShell from '@/components/LoginPageShell'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const branding = getBranding(useSettingsStore((state) => state.settings))

  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      login(data.agent)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Credenciais invalidas')
      setForm((current) => ({ ...current, password: '' }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <LoginPageShell branding={branding}>
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
            <input
              type="password"
              className="input border-white/10 bg-[rgba(35,29,29,0.55)] text-[#f6eee8] placeholder:text-[#ab9faa]"
              placeholder="••••••••"
              value={form.password}
              onChange={set('password')}
              autoComplete="current-password"
              disabled={loading}
            />
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

          <p className="relative text-center lg:text-left">
            <Link to="/esqueci-senha" className="text-sm text-[#cbbfdf] underline-offset-4 hover:text-white hover:underline">
              Esqueci minha senha
            </Link>
          </p>
        </form>

        <p className="relative mt-7 text-center text-xs uppercase tracking-[0.18em] text-[#cbbfdf] lg:text-left">
          Cuidado humano com rotina organizada
        </p>
      </div>
    </LoginPageShell>
  )
}
