import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuthStore } from '@/store'
import { api } from '@/services/api'

export default function Login() {
  const navigate  = useNavigate()
  const login     = useAuthStore(s => s.login)

  const [form, setForm]       = useState({ email: '', password: '' })
  /* campo "email" mantido internamente para compatibilidade com o backend */
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  function set(field) {
    return (e) => {
      setForm(f => ({ ...f, [field]: e.target.value }))
      setError('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      const data = await api.auth.login(form)
      login(data.token, data.agent)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-subtle flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: .4, ease: [.16, 1, .3, 1] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary-600 items-center justify-center mb-4 shadow-lg shadow-primary-600/30">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">CareDesk</h1>
          <p className="text-sm text-slate-500 mt-1">Acompanhamento pós-operatório</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Usuário</label>
              <input
                type="text"
                className="input"
                placeholder="nome de usuário"
                value={form.email}
                onChange={set('email')}
                autoFocus
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              className="btn-primary w-full mt-2"
              disabled={loading}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <><LogIn size={16} /> Entrar</>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          CareDesk · Acompanhamento pós-cirúrgico
        </p>
      </motion.div>
    </div>
  )
}
