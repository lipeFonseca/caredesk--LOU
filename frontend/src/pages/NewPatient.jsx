import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, UserPlus } from 'lucide-react'
import { api } from '@/services/api'

const DEFAULT_PROTOCOL = '7,15,30,60,90'

export default function NewPatient() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name:              '',
    phone:             '',
    email:             '',
    procedure:         '',
    surgery_date:      new Date().toISOString().split('T')[0],
    assigned_agent_id: '',
    protocol_days:     DEFAULT_PROTOCOL,
    notes:             '',
  })
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.agents.list().then(data => setAgents(data ?? [])).catch(() => {})
  }, [])

  function set(field) {
    return (e) => {
      setForm(f => ({ ...f, [field]: e.target.value }))
      setError('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.procedure.trim() || !form.surgery_date) {
      setError('Nome, procedimento e data da cirurgia são obrigatórios')
      return
    }
    setLoading(true)
    try {
      const created = await api.patients.create(form)
      navigate(`/patients/${created.id}`, { replace: true })
    } catch (err) {
      setError(err.message || 'Erro ao cadastrar paciente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/patients" className="btn-ghost !px-2 !py-2">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Novo paciente</h1>
          <p className="text-sm text-slate-500 mt-0.5">Preencha os dados do paciente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-5"
        >
          {/* Dados pessoais */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Dados pessoais
            </h2>
            <div className="space-y-3">
              <div>
                <label className="label">Nome completo *</label>
                <input
                  className="input"
                  placeholder="Nome do paciente"
                  value={form.name}
                  onChange={set('name')}
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input
                    className="input"
                    placeholder="(85) 99999-9999"
                    value={form.phone}
                    onChange={set('phone')}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="paciente@email.com"
                    value={form.email}
                    onChange={set('email')}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </section>

          <hr className="border-surface-border" />

          {/* Dados clínicos */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Dados clínicos
            </h2>
            <div className="space-y-3">
              <div>
                <label className="label">Procedimento / Cirurgia *</label>
                <input
                  className="input"
                  placeholder="Ex: Rinoplastia, Abdominoplastia…"
                  value={form.procedure}
                  onChange={set('procedure')}
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Data da cirurgia *</label>
                  <input
                    type="date"
                    className="input"
                    value={form.surgery_date}
                    onChange={set('surgery_date')}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="label">Agente responsável</label>
                  <select
                    className="input"
                    value={form.assigned_agent_id}
                    onChange={set('assigned_agent_id')}
                    disabled={loading}
                  >
                    <option value="">Não atribuído</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <hr className="border-surface-border" />

          {/* Protocolo */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Protocolo de follow-up
            </h2>

            <div>
              <label className="label">Dias do protocolo</label>
              <input
                className="input"
                placeholder={DEFAULT_PROTOCOL}
                value={form.protocol_days}
                onChange={set('protocol_days')}
                disabled={loading}
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Informe os dias após a cirurgia em que o paciente deve ser contactado, separados por vírgula.
              </p>
            </div>

            {/* Protocolo visual */}
            <div className="flex flex-wrap gap-2 mt-3">
              {form.protocol_days.split(',').filter(Boolean).map((d, i) => (
                <span key={i} className="badge bg-primary-50 text-primary-700">
                  Dia {d.trim()}
                </span>
              ))}
            </div>
          </section>

          <hr className="border-surface-border" />

          {/* Observações */}
          <section>
            <label className="label">Observações</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Informações adicionais sobre o paciente…"
              value={form.notes}
              onChange={set('notes')}
              disabled={loading}
            />
          </section>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl"
            >
              {error}
            </motion.p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Link to="/patients" className="btn-ghost flex-1 justify-center">
              Cancelar
            </Link>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><UserPlus size={16} /> Cadastrar paciente</>
              }
            </button>
          </div>
        </motion.div>
      </form>
    </div>
  )
}
