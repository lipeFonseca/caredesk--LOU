import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '@/services/api'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  buildProtocolMilestones,
  buildProtocolTimeline,
  formatProtocolDay,
  normalizeProtocolDays,
} from '@/utils/protocols'
import PatientProtocolTimeline from '@/components/patient/PatientProtocolTimeline'
import DatePickerField from '@/components/ui/date-picker'
import { calcularIdade } from '@/utils/contactDisplay'

const BACKFILL_CONTACT_TYPES = [
  { value: 'call', label: 'Ligação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'in_person', label: 'Presencial' },
]

export default function NewPatient() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name:         '',
    phone:        '',
    email:        '',
    cpf:          '',
    data_nascimento: '',
    responsavel:  '',
    procedure:    '',
    surgery_date: new Date().toISOString().split('T')[0],
    protocol_id:  '',
    notes:        '',
  })
  const [protocols, setProtocols] = useState([])
  const [documents, setDocuments] = useState([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // Paciente que já estava em acompanhamento fora do sistema — o cadastro
  // precisa nascer sabendo até onde ele já foi contatado, senão o próximo
  // marco sugerido volta pro começo do protocolo.
  const [alreadyInTreatment, setAlreadyInTreatment]         = useState(false)
  const [lastCompletedDayOffset, setLastCompletedDayOffset] = useState('')
  const [backfillContactType, setBackfillContactType]       = useState('call')

  useEffect(() => {
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

  const idadePaciente = form.data_nascimento ? calcularIdade(form.data_nascimento) : null
  const pacienteMenorDeIdade = idadePaciente != null && idadePaciente < 18

  // Marcos do protocolo selecionado que já passaram da data prevista — são as
  // únicas opções que fazem sentido oferecer como "último já contatado". A
  // lista já sai na ordem certa porque normalizeProtocolDays/buildProtocolMilestones
  // preservam a ordem crescente dos dias.
  const selectedProtocol = protocols.find(p => p.id === form.protocol_id)
  const protocolDaysForForm = selectedProtocol ? normalizeProtocolDays(selectedProtocol.days) : []
  const milestonesForForm = form.surgery_date
    ? buildProtocolMilestones(form.surgery_date, protocolDaysForForm)
    : []
  const todayStr = new Date().toISOString().split('T')[0]
  const pastMilestones = milestonesForForm.filter(m => m.dateStr <= todayStr)

  // Quantos marcos o backfill cobre — usado tanto pro preview da linha do
  // tempo quanto, indiretamente, pro payload enviado ao backend.
  const coveredCount = lastCompletedDayOffset === ''
    ? 0
    : pastMilestones.findIndex(m => m.day === Number(lastCompletedDayOffset)) + 1

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.procedure.trim() || !form.surgery_date || !form.data_nascimento) {
      setError('Nome, procedimento, data da cirurgia e data de nascimento são obrigatórios')
      return
    }
    if (form.cpf.replace(/\D/g, '').length !== 11) {
      setError('CPF inválido')
      return
    }
    if (pacienteMenorDeIdade && !form.responsavel.trim()) {
      setError('Responsável é obrigatório para pacientes menores de idade')
      return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        ...(alreadyInTreatment && lastCompletedDayOffset !== ''
          ? {
              backfill: {
                last_completed_day_offset: Number(lastCompletedDayOffset),
                contact_type: backfillContactType,
              },
            }
          : {}),
      }
      const created = await api.patients.create(payload)
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">CPF *</label>
                  <input
                    className="input"
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={set('cpf')}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="label">Data de nascimento *</label>
                  <DatePickerField
                    value={form.data_nascimento}
                    onChange={set('data_nascimento')}
                    disabled={loading}
                  />
                  {idadePaciente != null && (
                    <p className="mt-1 text-[11px] text-on-surface-variant">{idadePaciente} anos</p>
                  )}
                </div>
              </div>
              <div>
                <label className="label">
                  Responsável {pacienteMenorDeIdade ? '*' : <span className="text-outline font-normal">(opcional para maiores de idade)</span>}
                </label>
                <input
                  className="input"
                  placeholder="Nome do responsável"
                  value={form.responsavel}
                  onChange={set('responsavel')}
                  disabled={loading}
                />
                {pacienteMenorDeIdade && (
                  <p className="mt-1 text-[11px] text-on-surface-variant">Obrigatório — paciente menor de idade.</p>
                )}
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
              <div>
                <label className="label">Data da cirurgia *</label>
                <DatePickerField
                  value={form.surgery_date}
                  onChange={set('surgery_date')}
                  disabled={loading}
                />
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

          {/* Paciente que já estava em acompanhamento fora do sistema */}
          <section>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary shrink-0"
                checked={alreadyInTreatment}
                onChange={(e) => {
                  setAlreadyInTreatment(e.target.checked)
                  if (!e.target.checked) setLastCompletedDayOffset('')
                }}
                disabled={loading}
              />
              <span>
                <span className="block text-label-md font-label-md text-on-surface font-semibold">
                  Paciente já está em acompanhamento
                </span>
                <span className="block text-body-md text-on-surface-variant mt-0.5">
                  Marque se o contato com este paciente já começou antes de existir no sistema — o próximo marco sugerido é calculado a partir de onde ele já está, não do início do protocolo.
                </span>
              </span>
            </label>

            {alreadyInTreatment && (
              <div className="mt-4 space-y-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
                {!form.surgery_date || !selectedProtocol ? (
                  <p className="text-body-md text-on-surface-variant">
                    Selecione a data da cirurgia e o protocolo de contato primeiro.
                  </p>
                ) : pastMilestones.length === 0 ? (
                  <p className="text-body-md text-on-surface-variant">
                    Nenhum marco deste protocolo já passou da data prevista — não há contato anterior para registrar.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="label">Até qual marco o paciente já foi contatado?</label>
                      <select
                        className="input"
                        value={lastCompletedDayOffset}
                        onChange={(e) => setLastCompletedDayOffset(e.target.value)}
                        disabled={loading}
                      >
                        <option value="">Nenhum ainda — começar do início do protocolo</option>
                        {pastMilestones.map((m) => (
                          <option key={m.day} value={m.day}>
                            {formatProtocolDay(m.day)} · previsto para {format(parseISO(m.dateStr), 'dd/MM/yyyy', { locale: ptBR })}
                          </option>
                        ))}
                      </select>
                    </div>

                    {lastCompletedDayOffset !== '' && (
                      <>
                        <div>
                          <label className="label">Como esses contatos foram feitos?</label>
                          <select
                            className="input"
                            value={backfillContactType}
                            onChange={(e) => setBackfillContactType(e.target.value)}
                            disabled={loading}
                          >
                            {BACKFILL_CONTACT_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <p className="mt-1.5 text-[11px] text-on-surface-variant">
                            Um único tipo pro lote retroativo inteiro — se variou, ajuste depois direto no histórico do paciente.
                          </p>
                        </div>

                        <div>
                          <p className="label mb-2">Confira a linha do tempo antes de confirmar</p>
                          <PatientProtocolTimeline
                            timeline={buildProtocolTimeline(
                              {
                                surgery_date: form.surgery_date,
                                followup_logs: Array.from({ length: coveredCount }, () => ({ is_extra_contact: false })),
                              },
                              protocolDaysForForm
                            )}
                            variant="compact"
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
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
