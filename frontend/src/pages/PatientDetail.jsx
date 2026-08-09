import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/services/api'
import { useAuthStore } from '@/store'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  buildProtocolMilestones,
  buildProtocolTimeline,
  formatProtocolDay,
  formatProtocolDayShort,
  getCompletedProtocolCount,
  getNextFollowup,
  normalizeProtocolDays,
} from '@/utils/protocols'
import {
  CONTACT_TYPES,
  CONTACT_TYPE_CONFIG,
  OUTCOMES,
  URGENCY_BADGE,
  getInitials,
  formatCpf,
  calcularIdade,
} from '@/utils/contactDisplay'
import PatientDocumentsSection from '@/components/patient/PatientDocumentsSection'
import PatientIdentitySummary from '@/components/patient/PatientIdentitySummary'
import PatientNextFollowupCard from '@/components/patient/PatientNextFollowupCard'
import PatientProtocolTimeline from '@/components/patient/PatientProtocolTimeline'
import ProtocolDayChips from '@/components/patient/ProtocolDayChips'
import ContactLogEntry from '@/components/patient/ContactLogEntry'
import DatePickerField from '@/components/ui/date-picker'

function buildInitialLogForm(patient = null) {
  return {
    contact_date: new Date().toISOString().split('T')[0],
    contact_type: patient?.suggested_message_templates?.[0]?.contact_type || 'call',
    outcome: 'reached',
    notes: '',
    next_followup_date: '',
    is_extra_contact: false,
    new_protocol_id: '',
  }
}

export default function PatientDetail() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const { isAdmin }     = useAuthStore()

  const [patient,    setPatient]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [addOpen,    setAddOpen]    = useState(false)
  const [editOpen,   setEditOpen]   = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [protocols,  setProtocols]  = useState([])
  const [customProto, setCustomProto] = useState({ name: 'Personalizado', days: [-2, 0], manualType: 'after', manualDay: '' })

  const [logForm, setLogForm] = useState(buildInitialLogForm())

  const [editForm, setEditForm] = useState({})
  const [messageCopied, setMessageCopied] = useState(false)
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0)

  async function load() {
    setLoading(true)
    try {
      const [data] = await Promise.all([
        api.patients.get(id),
        protocols.length === 0
          ? api.protocols.list().then(ps => setProtocols(ps ?? [])).catch(() => {})
          : Promise.resolve(),
      ])
      setPatient(data)
      setLogForm(buildInitialLogForm(data))
      setSelectedTemplateIndex(0)
      setEditForm({
        name:              data.name,
        phone:             data.phone || '',
        email:             data.email || '',
        cpf:               data.cpf ? formatCpf(data.cpf) : '',
        data_nascimento:   data.data_nascimento || '',
        responsavel:       data.responsavel || '',
        procedure:         data.procedure,
        surgery_date:      data.surgery_date,
        status:            data.status,
        notes:             data.notes || '',
        assigned_agent_id: data.assigned_agent_id || '',
        protocol_id:       data.protocol_id || data.resolved_protocol_id || '',
      })
    } catch {
      navigate('/patients', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  function calcAutoNextDate(isExtra = false) {
    if (!patient?.surgery_date || !Array.isArray(patientProtocolDays)) return ''
    const milestones = buildProtocolMilestones(patient.surgery_date, patientProtocolDays)
    const completedCount = getCompletedProtocolCount(patient.followup_logs)
    // Se é extra, não avança o índice do protocolo; se normal, próximo após este
    const nextIdx = isExtra ? completedCount : completedCount + 1
    return milestones[nextIdx]?.dateStr || ''
  }

  async function handleAddLog(e) {
    e.preventDefault()
    setSaving(true)
    try {
      let resolvedProtocolId = logForm.new_protocol_id

      // Se escolheu criar protocolo customizado, cria antes de salvar o log
      if (logForm.is_extra_contact && logForm.new_protocol_id === '__custom__') {
        if (customProto.days.length === 0) {
          alert('Adicione pelo menos um dia ao protocolo personalizado.')
          setSaving(false)
          return
        }
        const created = await api.protocols.create({
          name:      customProto.name.trim() || 'Personalizado',
          days:      customProto.days,
          color:     '#8b5cf6',
          is_default: 0,
          is_custom:  1,
        })
        resolvedProtocolId = created.id
      }

      await api.followups.create({
        patient_id:         id,
        contact_date:       logForm.contact_date,
        contact_type:       logForm.contact_type,
        outcome:            logForm.outcome,
        notes:              logForm.notes || null,
        next_followup_date: logForm.next_followup_date || null,
        is_extra_contact:   logForm.is_extra_contact ? 1 : 0,
      })

      // Atualiza protocolo do paciente se selecionado
      if (logForm.is_extra_contact && resolvedProtocolId && resolvedProtocolId !== '__custom__') {
        await api.patients.update(id, { protocol_id: resolvedProtocolId })
      }

      setAddOpen(false)
      setLogForm(buildInitialLogForm(patient))
      setCustomProto({ name: 'Personalizado', days: [-2, 0], manualType: 'after', manualDay: '' })
      setMessageCopied(false)
      setSelectedTemplateIndex(0)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditPatient(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patients.update(id, editForm)
      setEditOpen(false)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Arquivar e desarquivar são a mesma ação em sentidos opostos, e nenhuma
  // perde dado — por isso ambas ficam com o agente, não só com o admin.
  async function alternarArquivamento() {
    setSaving(true)
    try {
      await (patient.archived_at ? api.patients.unarchive(id) : api.patients.archive(id))
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await api.patients.delete(id)
      navigate('/patients', { replace: true })
    } catch (err) {
      alert(err.message)
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-6 w-40 bg-surface-container-high rounded" />
      <div className="h-36 bg-surface-container-low rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        <div className="md:col-span-8 space-y-5">
          <div className="h-64 bg-surface-container-low rounded-xl" />
          <div className="h-80 bg-surface-container-low rounded-xl" />
        </div>
        <div className="md:col-span-4 space-y-5">
          <div className="h-52 bg-surface-container-low rounded-xl" />
          <div className="h-44 bg-surface-container-low rounded-xl" />
        </div>
      </div>
    </div>
  )

  if (!patient) return null

  // Use patient's own protocol days, fallback to global
  const patientProtocolDays = normalizeProtocolDays(patient.protocol_days_parsed)
  const nextFollowup = getNextFollowup(patient, patientProtocolDays)
  const timeline     = buildProtocolTimeline(patient, patientProtocolDays)
  const initials     = getInitials(patient.name)
  const urg          = URGENCY_BADGE[patient.followup_urgency] ?? URGENCY_BADGE.none

  // Paciente arquivado ganha a faixa no topo com o botão de devolver, então
  // aqui a ação de arquivar só aparece para quem ainda está em acompanhamento.
  const quickActions = [
    { icon: 'add',           label: 'Registrar\nContato', action: () => setAddOpen(true) },
    { icon: 'call',          label: 'Fazer\nLigação',      action: patient.phone ? () => window.open(`tel:${patient.phone}`) : null },
    { icon: 'edit',          label: 'Editar\nDados',        action: () => setEditOpen(true) },
    !patient.archived_at
      ? { icon: 'inventory_2', label: 'Arquivar\nPaciente', action: alternarArquivamento }
      : null,
    isAdmin()
      ? { icon: 'delete', label: 'Excluir\nPaciente', action: () => setDelConfirm(true), danger: true }
      : null,
  ].filter(Boolean)

  return (
    <div className="animate-fade-in space-y-5">

      {/* ── Breadcrumb ──────────────────────────────────────────── */}
      <nav className="flex items-center text-body-md text-on-surface-variant">
        <Link to="/patients" className="hover:text-primary transition-colors">Pacientes</Link>
        <span className="material-symbols-outlined mx-1" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{patient.name}</span>
      </nav>

      {/* ── Faixa de arquivado ──────────────────────────────────── */}
      {patient.archived_at && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-5 py-4">
          <p className="text-body-md text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-outline">inventory_2</span>
            <span>
              Paciente arquivado em{' '}
              <strong className="text-on-surface">
                {format(parseISO(patient.archived_at.replace(' ', 'T')), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </strong>
              {' '}— fora das listagens e buscas do dia a dia.
            </span>
          </p>
          <button
            onClick={alternarArquivamento}
            disabled={saving}
            className="btn-primary shrink-0 disabled:opacity-50"
          >
            {saving ? <Spinner /> : <><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>unarchive</span> Devolver ao acompanhamento</>}
          </button>
        </div>
      )}

      {/* ── Header Card ─────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <PatientIdentitySummary patient={patient} initials={initials} urg={urg} variant="full" />
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 bg-surface text-on-surface border border-outline-variant rounded-lg text-label-md font-label-md hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
              Editar
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:opacity-90 transition-opacity ambient-shadow-lvl1 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
              Registrar Contato
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

        {/* Coluna esquerda — 8 cols */}
        <div className="md:col-span-8 space-y-5">

          {/* Dados Clínicos */}
          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
            <h2 className="text-headline-sm font-headline-sm text-on-surface mb-6 pb-4 border-b border-outline-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-outline">patient_list</span>
              Dados Clínicos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              <div>
                <p className="text-label-sm font-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Telefone</p>
                <p className="text-body-md font-body-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }}>call</span>
                  {patient.phone || <span className="text-outline">Não informado</span>}
                </p>
              </div>

              <div>
                <p className="text-label-sm font-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">E-mail</p>
                <p className="text-body-md font-body-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }}>mail</span>
                  {patient.email
                    ? <a href={`mailto:${patient.email}`} className="hover:text-primary hover:underline truncate">{patient.email}</a>
                    : <span className="text-outline">Não informado</span>}
                </p>
              </div>

              <div>
                <p className="text-label-sm font-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">CPF</p>
                <p className="text-body-md font-body-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }}>badge</span>
                  {patient.cpf ? formatCpf(patient.cpf) : <span className="text-outline">Não informado</span>}
                </p>
              </div>

              <div>
                <p className="text-label-sm font-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Data de nascimento</p>
                <p className="text-body-md font-body-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }}>cake</span>
                  {patient.data_nascimento
                    ? <>{format(parseISO(patient.data_nascimento), 'dd/MM/yyyy', { locale: ptBR })} · {calcularIdade(patient.data_nascimento)} anos</>
                    : <span className="text-outline">Não informado</span>}
                </p>
              </div>

              <div>
                <p className="text-label-sm font-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">
                  Responsável {patient.data_nascimento && calcularIdade(patient.data_nascimento) < 18 && <span className="text-error normal-case">(obrigatório · menor de idade)</span>}
                </p>
                <p className="text-body-md font-body-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '16px' }}>person</span>
                  {patient.responsavel || <span className="text-outline">Não informado</span>}
                </p>
              </div>

              <div>
                <p className="text-label-sm font-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Especialista Responsável</p>
                <p className="text-body-md font-body-md text-on-surface flex items-center gap-2">
                  {patient.agent_name ? (
                    <>
                      <span className="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-primary border border-outline-variant shrink-0">
                        {getInitials(patient.agent_name)}
                      </span>
                      {patient.agent_name}
                    </>
                  ) : (
                    <span className="text-outline">Não atribuído</span>
                  )}
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-outline" style={{ fontSize: '14px' }}>route</span>
                    Protocolo de Contato
                  </p>
                  {patient.resolved_protocol_name && (
                    <span className="flex items-center gap-1.5 text-label-sm font-label-sm font-semibold text-on-surface">
                      {patient.resolved_protocol_is_custom ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ede9fe] border border-[#ddd6fe] text-[#7c3aed] text-[11px] font-semibold">
                          <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>stars</span>
                          Protocolo Customizado
                        </span>
                      ) : (
                        <>
                          {patient.resolved_protocol_color && (
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: patient.resolved_protocol_color }} />
                          )}
                          {patient.resolved_protocol_name}
                        </>
                      )}
                    </span>
                  )}
                </div>
                <ProtocolDayChips days={patientProtocolDays} variant="full" />
              </div>

              {patient.notes && (
                <div className="sm:col-span-2 mt-2">
                  <p className="text-label-sm font-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">Notas Clínicas</p>
                  <div className="bg-surface-container-low p-4 rounded-lg border border-outline-variant text-body-md text-on-surface">
                    {patient.notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Documentos */}
          <PatientDocumentsSection patientId={id} />

          {/* Linha do Tempo do Protocolo */}
          <PatientProtocolTimeline timeline={timeline} variant="full" />

          {/* Histórico de Contatos */}
          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-outline-variant">
              <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-outline">history</span>
                Histórico de Contatos
                <span className="ml-1 bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm px-2 py-0.5 rounded-full border border-outline-variant">
                  {patient.followup_logs?.length ?? 0}
                </span>
              </h2>
            </div>

            {!patient.followup_logs?.length ? (
              <div className="flex flex-col items-center py-10 gap-3 text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>history_toggle_off</span>
                <p className="text-label-md font-label-md">Nenhum contato registrado ainda</p>
                <button
                  onClick={() => setAddOpen(true)}
                  className="text-primary text-label-sm font-label-sm hover:underline"
                >
                  Registrar primeiro contato
                </button>
              </div>
            ) : (
              <div className="relative pl-6 sm:pl-8 border-l-2 border-surface-container-high space-y-8 mt-4">
                {patient.followup_logs.map(log => (
                  <ContactLogEntry key={log.id} log={log} variant="full" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita — 4 cols */}
        <div className="md:col-span-4 space-y-5">

          {/* Próximo Contato */}
          {nextFollowup && <PatientNextFollowupCard nextFollowup={nextFollowup} variant="full" />}

          {/* Ações Rápidas */}
          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
            <h3 className="text-label-md font-label-md text-on-surface font-semibold mb-4 pb-2 border-b border-outline-variant">
              Ações Rápidas
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((item, i) => (
                <button
                  key={i}
                  onClick={item.action}
                  disabled={!item.action}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-colors group disabled:opacity-40 disabled:cursor-default ${
                    item.danger
                      ? 'bg-error-container/10 border-error/20 hover:bg-error-container/30'
                      : 'bg-surface-container-low border-outline-variant hover:bg-surface-container-high'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined mb-2 transition-colors ${
                      item.danger
                        ? 'text-error'
                        : 'text-outline group-hover:text-primary'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="text-label-sm font-label-sm text-on-surface text-center leading-tight whitespace-pre-line">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: Registrar Contato ──────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Registrar Contato" wide>
        <form onSubmit={handleAddLog} className="space-y-4">

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data do contato</label>
              <DatePickerField
                value={logForm.contact_date}
                onChange={e => setLogForm(f => ({ ...f, contact_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label flex items-center justify-between">
                <span>Próximo contato</span>
                <button
                  type="button"
                  title="Preencher pelo protocolo"
                  onClick={() => setLogForm(f => ({ ...f, next_followup_date: calcAutoNextDate(f.is_extra_contact) }))}
                  className="inline-flex items-center gap-1 text-primary text-[11px] font-semibold hover:underline normal-case tracking-normal"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>auto_schedule</span>
                  Pelo protocolo
                </button>
              </label>
              <DatePickerField
                value={logForm.next_followup_date}
                onChange={e => setLogForm(f => ({ ...f, next_followup_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Tipo de contato */}
          <div>
            <label className="label">Tipo de contato</label>
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_TYPES.map(({ value, label, icon }) => (
                <button
                  key={value} type="button"
                  onClick={() => setLogForm(f => ({ ...f, contact_type: value }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-label-md font-label-md transition-all
                    ${logForm.contact_type === value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Resultado */}
          <div>
            <label className="label">Resultado</label>
            <select className="input"
              value={logForm.outcome}
              onChange={e => setLogForm(f => ({ ...f, outcome: e.target.value }))}
            >
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Observações */}
          <div>
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={2}
              placeholder="Anotações sobre o contato…"
              value={logForm.notes}
              onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {!logForm.is_extra_contact && patient.next_protocol_step && (
            patient.suggested_message_templates?.length ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                {(() => {
                  const templates = patient.suggested_message_templates
                  const selected = templates[selectedTemplateIndex] ?? templates[0]
                  return (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-label-sm font-semibold uppercase tracking-wider text-primary">
                            Mensagem sugerida pelo protocolo
                          </p>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            {selected.milestone_label} · previsto para {selected.milestone_date}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(selected.rendered_content || '')
                              setMessageCopied(true)
                              setTimeout(() => setMessageCopied(false), 2500)
                            }}
                            className="rounded-lg border border-outline-variant px-3 py-1.5 text-label-sm text-on-surface transition-colors hover:bg-surface-container-low"
                          >
                            {messageCopied ? 'Copiado' : 'Copiar mensagem'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setLogForm((current) => ({
                              ...current,
                              contact_type: selected.contact_type || current.contact_type,
                              notes: selected.rendered_content || current.notes,
                            }))}
                            className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-label-sm text-primary transition-colors hover:bg-primary/15"
                          >
                            Usar no registro
                          </button>
                        </div>
                      </div>

                      {/* Mais de um template no mesmo marco e proposital (variar o
                          texto evita padrao de banimento de numero no WhatsApp) —
                          seletor so aparece quando ha o que escolher. */}
                      {templates.length > 1 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {templates.map((template, index) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => setSelectedTemplateIndex(index)}
                              className={`rounded-full border px-3 py-1 text-label-sm font-label-sm transition-colors ${
                                index === selectedTemplateIndex
                                  ? 'border-primary bg-primary text-on-primary'
                                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
                              }`}
                            >
                              {template.title}
                            </button>
                          ))}
                        </div>
                      )}

                      <h4 className="mt-3 text-label-md font-semibold text-on-surface">{selected.title}</h4>
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant">
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                          {CONTACT_TYPE_CONFIG[selected.contact_type]?.icon ?? 'chat'}
                        </span>
                        Forma sugerida: {CONTACT_TYPE_CONFIG[selected.contact_type]?.label ?? selected.contact_type}
                      </p>

                      <div className="mt-3 rounded-lg border border-outline-variant bg-surface px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-on-surface">
                          {selected.rendered_content}
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : (
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                  Próximo marco sem mensagem cadastrada
                </p>
                <p className="mt-1 text-sm text-on-surface">
                  {formatProtocolDay(patient.next_protocol_step.day_offset)} · previsto para {format(parseISO(patient.next_protocol_step.date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Cadastre uma mensagem na aba <strong className="text-on-surface">Protocolo de Mensagens</strong> para esse marco e o sistema passará a sugeri-la automaticamente aqui.
                </p>
              </div>
            )
          )}

          {/* Fora do protocolo */}
          <div className={`rounded-xl border transition-colors ${logForm.is_extra_contact ? 'border-[#f59e0b] bg-[#fffbeb]' : 'border-outline-variant bg-surface-container-low'}`}>
            <button
              type="button"
              onClick={() => setLogForm(f => ({ ...f, is_extra_contact: !f.is_extra_contact, new_protocol_id: '' }))}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                logForm.is_extra_contact ? 'bg-[#f59e0b] border-[#f59e0b]' : 'border-outline-variant bg-surface'
              }`}>
                {logForm.is_extra_contact && <span className="material-symbols-outlined text-white" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>check</span>}
              </div>
              <div>
                <p className={`text-label-md font-label-md font-semibold ${logForm.is_extra_contact ? 'text-[#92400e]' : 'text-on-surface'}`}>
                  Contato solicitado pelo paciente
                </p>
                <p className="text-[11px] text-on-surface-variant">Fora do protocolo — não avança a sequência de contatos</p>
              </div>
            </button>

            {logForm.is_extra_contact && (
              <div className="px-4 pb-4 space-y-3 border-t border-[#fde68a]">
                <p className="text-label-sm font-label-sm text-[#92400e] pt-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>route</span>
                  Revisar protocolo do paciente (opcional):
                </p>

                <select
                  className="input"
                  value={logForm.new_protocol_id}
                  onChange={e => {
                    setLogForm(f => ({ ...f, new_protocol_id: e.target.value }))
                    if (e.target.value !== '__custom__') {
                      setCustomProto({ name: 'Personalizado', days: [-2, 0], manualType: 'after', manualDay: '' })
                    }
                  }}
                >
                  <option value="">Manter protocolo atual ({patient.resolved_protocol_name ?? 'padrão'})</option>
                  {protocols.filter(p => p.id !== (patient.protocol_id || patient.resolved_protocol_id)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (Padrão)' : ''}</option>
                  ))}
                  <option value="__custom__">✦ Criar protocolo personalizado para este paciente</option>
                </select>

                {/* Builder de protocolo customizado */}
                {logForm.new_protocol_id === '__custom__' && (
                  <div className="bg-white rounded-lg border border-[#fde68a] p-3 space-y-3">
                    <div>
                      <label className="label text-[11px]">Nome do protocolo</label>
                      <input
                        className="input text-sm"
                        value={customProto.name}
                        onChange={e => setCustomProto(p => ({ ...p, name: e.target.value }))}
                        placeholder="Ex: Personalizado Felipe"
                      />
                    </div>

                    {/* Adicionar dia manual */}
                    <div>
                      <label className="label text-[11px]">Adicionar marco manual</label>
                      <div className="flex gap-2 mb-2">
                        {[
                          { value: 'before', label: 'Antes' },
                          { value: 'surgery', label: 'Cirurgia' },
                          { value: 'after', label: 'Depois' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setCustomProto((p) => ({ ...p, manualType: option.value, manualDay: '' }))}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              customProto.manualType === option.value
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {customProto.manualType !== 'surgery' && (
                          <input
                            type="number" min="1" max="180"
                            className="input text-sm w-24"
                            placeholder="dias"
                            value={customProto.manualDay}
                            onChange={e => setCustomProto(p => ({ ...p, manualDay: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const amount = parseInt(customProto.manualDay, 10)
                                if (!amount || amount <= 0) return
                                const day = customProto.manualType === 'before' ? -amount : amount
                                setCustomProto(p => ({
                                  ...p,
                                  days: [...new Set([...p.days, day])].sort((a, b) => a - b),
                                  manualDay: ''
                                }))
                              }
                            }}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (customProto.manualType === 'surgery') {
                              setCustomProto(p => ({
                                ...p,
                                days: [...new Set([...p.days, 0])].sort((a, b) => a - b),
                              }))
                              return
                            }

                            const amount = parseInt(customProto.manualDay, 10)
                            if (!amount || amount <= 0) return
                            const day = customProto.manualType === 'before' ? -amount : amount
                            setCustomProto(p => ({
                              ...p,
                              days: [...new Set([...p.days, day])].sort((a, b) => a - b),
                              manualDay: ''
                            }))
                          }}
                          className="px-3 py-2 rounded-lg border border-outline-variant text-label-sm text-on-surface hover:bg-surface-container-low transition-colors"
                        >
                          + Adicionar
                        </button>
                      </div>
                    </div>

                    {/* Preview dos dias */}
                    {customProto.days.length > 0 && (
                      <div>
                        <p className="text-[11px] text-on-surface-variant mb-1.5">Dias selecionados ({customProto.days.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {customProto.days.map(d => (
                            <span key={d} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer group ${
                              d < 0  ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
                                     : d === 0 ? 'bg-primary/10 border-primary/30 text-primary'
                                     : 'bg-secondary/10 border-secondary/30 text-secondary'
                            }`}
                              onClick={() => setCustomProto(p => ({ ...p, days: p.days.filter(x => x !== d) }))}
                              title="Clique para remover"
                            >
                              {formatProtocolDayShort(d)}
                              <span className="material-symbols-outlined opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '10px' }}>close</span>
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-outline mt-1">Clique em um dia para remover</p>
                      </div>
                    )}
                  </div>
                )}

                {logForm.new_protocol_id && logForm.new_protocol_id !== '__custom__' && (
                  <p className="text-[11px] text-[#92400e] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>info</span>
                    O protocolo do paciente será atualizado ao salvar.
                  </p>
                )}
                {logForm.new_protocol_id === '__custom__' && (
                  <p className="text-[11px] text-[#92400e] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>info</span>
                    Um protocolo personalizado será criado e atribuído a este paciente.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setAddOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? <Spinner /> : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Editar Paciente ───────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Paciente">
        <form onSubmit={handleEditPatient} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Nome completo</label>
              <input className="input" value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input type="email" className="input" placeholder="opcional" value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">CPF</label>
              <input className="input" placeholder="000.000.000-00" value={editForm.cpf}
                onChange={e => setEditForm(f => ({ ...f, cpf: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Data de nascimento</label>
              <DatePickerField value={editForm.data_nascimento}
                onChange={e => setEditForm(f => ({ ...f, data_nascimento: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">
                Responsável {editForm.data_nascimento && calcularIdade(editForm.data_nascimento) < 18 && '*'}
              </label>
              <input className="input" value={editForm.responsavel}
                onChange={e => setEditForm(f => ({ ...f, responsavel: e.target.value }))}
                required={Boolean(editForm.data_nascimento && calcularIdade(editForm.data_nascimento) < 18)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Procedimento</label>
              <input className="input" value={editForm.procedure}
                onChange={e => setEditForm(f => ({ ...f, procedure: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Data da cirurgia</label>
              <DatePickerField value={editForm.surgery_date}
                onChange={e => setEditForm(f => ({ ...f, surgery_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={editForm.status}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Ativo</option>
                <option value="paused">Pausado</option>
                <option value="discharged">Alta</option>
              </select>
            </div>
            {protocols.length > 0 && (
              <div className="sm:col-span-2">
                <label className="label">Protocolo de Contato</label>
                <select className="input" value={editForm.protocol_id}
                  onChange={e => setEditForm(f => ({ ...f, protocol_id: e.target.value }))}>
                  <option value="">Sem protocolo específico (usar padrão)</option>
                  {protocols.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.is_default ? ' (Padrão)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Observações</label>
              <textarea className="input resize-none" rows={2} value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEditOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? <Spinner /> : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Confirmar Exclusão ────────────────────────────── */}
      <Modal open={delConfirm} onClose={() => setDelConfirm(false)} title="Excluir paciente">
        <div className="flex items-start gap-3 rounded-xl bg-error-container/20 border border-error/30 p-4 mb-5">
          <span className="material-symbols-outlined text-error shrink-0" style={{ fontSize: '22px' }}>warning</span>
          <div>
            <p className="text-body-md text-on-surface">
              Excluir <strong>{patient.name}</strong> apaga <strong>todos os dados do paciente</strong>, permanentemente.
            </p>
            <p className="text-label-md font-label-md text-error mt-2">Esta ação é irreversível.</p>
          </div>
        </div>

        <p className="text-label-sm font-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">
          Será apagado junto:
        </p>
        <ul className="text-body-md text-on-surface-variant mb-5 space-y-1.5">
          {[
            [patient.followup_logs?.length ?? 0, 'contato(s) registrado(s) no histórico'],
            [null, 'Documentos atribuídos e seu checklist'],
            [null, 'Notificações e o registro no Histórico do sistema'],
            [null, 'Cadastro, dados de contato e anotações'],
          ].map(([contagem, texto]) => (
            <li key={texto} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-error/70 shrink-0" style={{ fontSize: '16px', marginTop: '3px' }}>close</span>
              <span>{contagem !== null ? <><strong className="text-on-surface">{contagem}</strong> {texto}</> : texto}</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <button onClick={() => setDelConfirm(false)} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={handleDelete} className="btn-danger flex-1" disabled={saving}>
            {saving ? <Spinner /> : 'Excluir permanentemente'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function Modal({ open, onClose, title, children, wide = false }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
            <motion.div
              initial={{ opacity: 0, scale: .96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: .96, y: 16 }}
              transition={{ duration: .2, ease: [.16, 1, .3, 1] }}
              className={`w-[calc(100vw-1rem)] bg-surface rounded-2xl shadow-modal border border-outline-variant ${
                wide ? 'max-w-[70rem]' : 'max-w-[47.25rem]'
              }`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
                <h3 className="text-headline-sm font-headline-sm text-on-surface">{title}</h3>
                <button
                  onClick={onClose}
                  className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </div>
              <div className="p-5 max-h-[75vh] overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
}
