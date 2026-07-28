import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, KeyRound } from 'lucide-react'
import { useSettingsStore } from '@/store'
import { api } from '@/services/api'
import { getBranding } from '@/theme/branding'
import LoginPageShell from '@/components/LoginPageShell'

const CAMPO = 'input border-white/20 bg-[rgba(9,20,17,0.52)] text-[#f7f2ec] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-colors placeholder:text-[#b9b0a6] focus:border-white/40 focus:bg-[rgba(9,20,17,0.66)]'

export default function EsqueciSenha() {
  const navigate = useNavigate()
  const branding = getBranding(useSettingsStore((state) => state.settings))

  // 'email' pede o endereco; 'codigo' recebe o codigo e a senha nova. O e-mail
  // continua no estado entre as etapas porque a rota de reset precisa dele.
  const [etapa, setEtapa] = useState('email')
  const [form, setForm] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  function set(campo) {
    return (event) => {
      setForm((atual) => ({ ...atual, [campo]: event.target.value }))
      setError('')
    }
  }

  async function pedirCodigo(event) {
    event.preventDefault()
    if (!form.email.trim()) {
      setError('Informe o e-mail da sua conta.')
      return
    }

    setLoading(true)
    try {
      const data = await api.auth.forgotPassword({ email: form.email })
      // A API responde igual existindo conta ou nao — de proposito, pra nao
      // revelar quais e-mails estao cadastrados. A tela segue pro passo do
      // codigo em qualquer caso.
      setAviso(data.message || 'Se houver uma conta com esse e-mail, o código foi enviado.')
      setEtapa('codigo')
    } catch (err) {
      setError(err.message || 'Não foi possível solicitar o código.')
    } finally {
      setLoading(false)
    }
  }

  async function redefinir(event) {
    event.preventDefault()

    if (!form.code.trim()) {
      setError('Informe o código recebido por e-mail.')
      return
    }
    if (form.newPassword.length < 8) {
      setError('A nova senha precisa ter ao menos 8 caracteres.')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    setLoading(true)
    try {
      await api.auth.resetPassword({
        email: form.email,
        code: form.code,
        newPassword: form.newPassword,
      })
      navigate('/login', { replace: true, state: { senhaRedefinida: true } })
    } catch (err) {
      setError(err.message || 'Não foi possível redefinir a senha.')
      setForm((atual) => ({ ...atual, newPassword: '', confirmPassword: '' }))
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
          <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-[#ded5c9]">Redefinir senha</p>
          <h1 className="mt-3 text-display-md text-[#fbf7f2]">{branding.clinicName}</h1>
          <p className="mt-2 text-sm leading-6 text-[#e0d7cc]">
            {etapa === 'email'
              ? 'Informe o e-mail da sua conta e enviaremos um código de 6 dígitos.'
              : 'Digite o código que chegou por e-mail e escolha a nova senha.'}
          </p>
        </div>

        {etapa === 'email' ? (
          <form onSubmit={pedirCodigo} className="relative space-y-5">
            <div>
              <label className="label text-[#e6ded4]">E-mail da conta</label>
              <input
                type="email"
                className={CAMPO}
                placeholder="voce@clinica.com"
                value={form.email}
                onChange={set('email')}
                autoFocus
                autoComplete="email"
                disabled={loading}
              />
            </div>

            {error && <Mensagem tipo="erro">{error}</Mensagem>}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Girando /> : <><Mail size={16} /> Enviar código</>}
            </button>
          </form>
        ) : (
          <form onSubmit={redefinir} className="relative space-y-5">
            {aviso && <Mensagem tipo="aviso">{aviso}</Mensagem>}

            <div>
              <label className="label text-[#e6ded4]">Código de 6 dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className={`${CAMPO} tracking-[0.5em] text-center text-lg`}
                placeholder="000000"
                value={form.code}
                onChange={set('code')}
                autoFocus
                autoComplete="one-time-code"
                disabled={loading}
              />
            </div>

            <div>
              <label className="label text-[#e6ded4]">Nova senha</label>
              <input
                type="password"
                className={CAMPO}
                placeholder="••••••••"
                value={form.newPassword}
                onChange={set('newPassword')}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <div>
              <label className="label text-[#e6ded4]">Confirme a nova senha</label>
              <input
                type="password"
                className={CAMPO}
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            {error && <Mensagem tipo="erro">{error}</Mensagem>}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Girando /> : <><KeyRound size={16} /> Redefinir senha</>}
            </button>

            <button
              type="button"
              onClick={() => { setEtapa('email'); setError(''); setAviso('') }}
              className="w-full text-sm text-[#dcd3c8] underline-offset-4 hover:text-white hover:underline"
              disabled={loading}
            >
              Não recebeu? Pedir outro código
            </button>
          </form>
        )}

        <p className="relative mt-7 text-center lg:text-left">
          <Link to="/login" className="text-sm text-[#dcd3c8] underline-offset-4 hover:text-white hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </LoginPageShell>
  )
}

function Mensagem({ tipo, children }) {
  // Sobre vidro translúcido as caixas precisam de fundo próprio e borda: sem
  // isso a mensagem se dissolve no que está atrás.
  const estilo = tipo === 'erro'
    ? 'border border-error/40 bg-[rgba(120,26,26,0.42)] text-[#ffdad6] backdrop-blur-sm'
    : 'border border-white/15 bg-[rgba(9,20,17,0.45)] text-[#e8e0d6] backdrop-blur-sm'

  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className={`rounded-2xl px-4 py-3 text-sm ${estilo}`}
    >
      {children}
    </motion.p>
  )
}

function Girando() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
}

