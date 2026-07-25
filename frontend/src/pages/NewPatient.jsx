import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '@/services/api'
import { formatProtocolDay, normalizeProtocolDays } from '@/utils/protocols'

export default function NewPatient() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name:              '',
    phone:             '',
    email:             '',
    procedure:         '',
    surgery_date:      new Date().toISOString().split('T')[0],
    assigned_agent_id: '',
    protocol_id:       '',
    notes:             '',
  })
  const [agents, setAgents]       = useState([])
  const [protocols, setProtocols] = useState([])
  const [documents, setDocuments] = useState([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    api.agents.list().then(data => setAgents(data ?? [])).catch(() => {})
    api.protocols.list().then(data => {
      setProtocols(data ?? [])
      const def = (data ?? []).find(p => p.is_default)
      if (def) setForm(f => ({ ...f, protocol_id: def.id }))
    }).catch(() => {})
    api.documentTemplates.list().then(data => setDocuments(data ?? [])).catch(() => {})
  }, [])

  function toggleDocument(id) {
    setSelectedDocumentIds(current => (
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    ))
  }

  function set(field) {
    return (e) => { setForm(f => ({ ...f, [field]: e.target.value })); setError('') }
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
      if (selectedDocumentIds.length) {
        await Promise.all(
          selectedDocumentIds.map(id => api.patients.assignDocument(created.id, id))
        ).catch(() => {})
      }
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
        <Link to="/patients" className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>arrow_back</span>
        </Link>
        <div>
          <h1 className="text-display-md font-display-md text-on-surface">Novo paciente</h1>
          <p className="text-body-md text-on-surface-variant mt-0.5">Preencha os dados do paciente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6 space-y-6"
        >
          {/* Dados pessoais */}
          <section>
            <h2 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-4">
              Dados pessoais
            </h2>
            <div className="space-y-4">
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
              <div>
                <label className="label">Telefone</label>
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
                  placeholder="paciente@exemplo.com (opcional)"
                  value={form.email}
                  onChange={set('email')}
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          <hr className="border-outline-variant" />

          {/* Dados clínicos */}
          <section>
            <h2 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-4">
              Dados clínicos
            </h2>
            <div className="space-y-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <hr className="border-outline-variant" />

          {/* Protocolo de contato */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">
                Protocolo de contato
              </h2>
              <Link to="/admin" className="text-label-sm font-label-sm text-primary hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>settings</span>
                Gerenciar protocolos
              </Link>
            </div>
            {protocols.length === 0 ? (
              <p className="text-body-md text-outline italic">Nenhum protocolo configurado. <Link to="/admin" className="text-primary hover:underline">Criar protocolo</Link></p>
            ) : (
              <div className="space-y-2">
                {protocols.map(p => {
                  const sel = form.protocol_id === p.id
                  const days = normalizeProtocolDays(p.days)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, protocol_id: p.id }))}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        sel
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-outline-variant bg-surface hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color || '#6366f1' }} />
                        <span className="text-label-md font-label-md text-on-surface font-semibold">{p.name}</span>
                        {p.is_default && <span className="text-label-sm text-outline">(padrão)</span>}
                        {sel && <span className="material-symbols-outlined text-primary ml-auto" style={{ fontSize: '16px' }}>check_circle</span>}
                      </div>
                      {p.description && <p className="text-body-md text-on-surface-variant mb-2">{p.description}</p>}
                      {days.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-label-sm text-on-surface-variant">
                            {days.length} marco{days.length !== 1 ? 's' : ''} configurado{days.length !== 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-1">
                          {days.map(d => (
                            <span key={d} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              d < 0  ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
                                     : d === 0 ? 'bg-primary/10 border-primary/30 text-primary'
                                     : 'bg-secondary/10 border-secondary/30 text-secondary'
                            }`}>
                              {formatProtocolDay(d)}
                            </span>
                          ))}
                        </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <hr className="border-outline-variant" />

          {/* Documentos */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">
                Documentos
              </h2>
              <Link to="/admin" className="text-label-sm font-label-sm text-primary hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>settings</span>
                Gerenciar documentos
              </Link>
            </div>
            {documents.length === 0 ? (
              <p className="text-body-md text-outline italic">Nenhum documento configurado. <Link to="/admin" className="text-primary hover:underline">Criar documento</Link></p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { value: 'send', label: 'Enviar' },
                  { value: 'request', label: 'Solicitar' },
                ].map(({ value, label }) => {
                  const items = documents.filter(d => d.category === value)
                  if (!items.length) return null
                  return (
                    <div key={value}>
                      <p className="text-label-sm font-label-sm text-on-surface-variant mb-2">{label}</p>
                      <div className="space-y-1.5">
                        {items.map(doc => (
                          <label
                            key={doc.id}
                            className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-low cursor-pointer hover:bg-surface-container-high transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocumentIds.includes(doc.id)}
                              onChange={() => toggleDocument(doc.id)}
                              disabled={loading}
                              className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary shrink-0"
                            />
                            <span className="min-w-0">
                              <span className="block text-body-md text-on-surface truncate">{doc.name}</span>
                              {doc.description && (
                                <span className="block text-[11px] text-on-surface-variant truncate">{doc.description}</span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <hr className="border-outline-variant" />

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
              className="text-label-sm text-error bg-error-container/30 px-3 py-2 rounded-lg"
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
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>person_add</span>
                  Cadastrar paciente
                </>
              )}
            </button>
          </div>
        </motion.div>
      </form>
    </div>
  )
}
