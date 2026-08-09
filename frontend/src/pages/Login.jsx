import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Lock, ArrowRight } from 'lucide-react'
import { useAuthStore, useSettingsStore } from '@/store'
import { api } from '@/services/api'
import { getBranding } from '@/theme/branding'
import LoginPageShell from '@/components/login/LoginPageShell'

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
          {/* Sombra sutil no texto: sobre vidro claro o fundo pode ter áreas
              claras, e é ela que garante contraste sem opacificar o painel. */}
          <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">Entrar no painel</p>
          <h1 className="mt-3 text-display-md text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.4)]">{branding.clinicName}</h1>
          <p className="mt-2 text-sm leading-6 text-white/75 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">{branding.tagline}</p>
        </div>

        {/* Campos com sublinhado e rótulo flutuante: sobre vidro, caixa com
            fundo próprio vira um bloco opaco dentro do painel e quebra o efeito.
            O sublinhado deixa o vidro contínuo.
            O `placeholder=" "` (espaço, não vazio) é o que faz `placeholder-shown`
            distinguir campo vazio de preenchido — é ele que move o rótulo. */}
        <form onSubmit={handleSubmit} className="relative space-y-8">
          <div className="relative z-0">
            <input
              type="text"
              id="login-usuario"
              className="peer block w-full appearance-none border-0 border-b-2 border-white/30 bg-transparent px-0 py-2.5 text-sm text-white transition-colors focus:border-primary focus:outline-none focus:ring-0 disabled:opacity-60"
              placeholder=" "
              value={form.email}
              onChange={set('email')}
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
            <label
              htmlFor="login-usuario"
              className="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 text-sm text-white/70 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-primary"
            >
              <User className="-mt-1 mr-2 inline-block" size={16} />
              Usuario
            </label>
          </div>

          <div className="relative z-0">
            <input
              type="password"
              id="login-senha"
              className="peer block w-full appearance-none border-0 border-b-2 border-white/30 bg-transparent px-0 py-2.5 text-sm text-white transition-colors focus:border-primary focus:outline-none focus:ring-0 disabled:opacity-60"
              placeholder=" "
              value={form.password}
              onChange={set('password')}
              autoComplete="current-password"
              disabled={loading}
            />
            <label
              htmlFor="login-senha"
              className="absolute top-3 -z-10 origin-[0] -translate-y-6 scale-75 text-sm text-white/70 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-primary"
            >
              <Lock className="-mt-1 mr-2 inline-block" size={16} />
              Senha
            </label>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-2xl border border-error/40 bg-[rgba(120,26,26,0.42)] px-4 py-3 text-sm text-[#ffdad6] backdrop-blur-sm"
            >
              {error}
            </motion.p>
          )}

          {/* Seta desliza no hover — o `group` no botão é quem dispara. */}
          <button type="submit" className="btn-primary group w-full" disabled={loading}>
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <>
                Entrar
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>

          <p className="relative text-center lg:text-left">
            <Link to="/esqueci-senha" className="text-xs text-white/70 transition-colors hover:text-white">
              Esqueci minha senha
            </Link>
          </p>
        </form>

        <p className="relative mt-7 text-center text-xs uppercase tracking-[0.18em] text-white/55 lg:text-left [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">
          Cuidado humano com rotina organizada
        </p>
      </div>
    </LoginPageShell>
  )
}
