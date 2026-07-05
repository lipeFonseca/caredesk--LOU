import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/services/api'
import { useNotifStore, useSettingsStore } from '@/store'
import { getBranding } from '@/theme/branding'
import { buildWhatsAppContext, buildWhatsAppUrl, normalizePhone, renderWhatsAppMessage } from '@/utils/whatsapp'

const urgencyConfig = {
  overdue: {
    bar: 'bg-error',
    badge: 'bg-[#f3d4cb] text-error',
    label: 'Atrasado',
    button: 'bg-[#f6ebd9] text-[#204237] hover:bg-[#efe0c7]',
  },
  due: {
    bar: 'bg-secondary',
    badge: 'bg-secondary/15 text-[#9d6a22]',
    label: 'Hoje',
    button: 'bg-primary text-on-primary hover:opacity-95',
  },
  soon: {
    bar: 'bg-tertiary',
    badge: 'bg-tertiary/15 text-[#8a5d3f]',
    label: 'Em breve',
    button: 'bg-surface-container-high text-on-surface hover:bg-surface',
  },
}

const activityConfig = {
  followup_overdue: {
    icon: 'priority_high',
    bg: 'bg-[#f3d4cb]',
    color: 'text-error',
    label: 'Contato em atraso',
  },
  followup_due: {
    icon: 'notifications_active',
    bg: 'bg-primary/12',
    color: 'text-primary',
    label: 'Contato pendente',
  },
}

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [whatsAppConfig, setWhatsAppConfig] = useState({ enabled: false, country_code: '55', open_delay_ms: 800, default_template_id: '' })
  const [whatsAppTemplates, setWhatsAppTemplates] = useState([])
  const [sentCount, setSentCount] = useState(0)
  const [pendingConfirmation, setPendingConfirmation] = useState([])
  const [registeringContacts, setRegisteringContacts] = useState(false)
  const [confirmationSuccess, setConfirmationSuccess] = useState('')
  const [sendError, setSendError] = useState('')
  const { notifications } = useNotifStore()
  const settings = useSettingsStore((state) => state.settings)
  const branding = getBranding(settings)
  const clinicName = branding.clinicName

  useEffect(() => {
    api.patients.list({ status: 'active' })
      .then((data) => setPatients(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))

    Promise.all([
      api.whatsapp.getConfig().catch(() => null),
      api.whatsapp.listTemplates().catch(() => []),
    ]).then(([config, templates]) => {
      if (config) setWhatsAppConfig(config)
      setWhatsAppTemplates(templates ?? [])
    })
  }, [])

  const stats = {
    total: patients.length,
    overdue: patients.filter((patient) => patient.followup_urgency === 'overdue').length,
    due: patients.filter((patient) => patient.followup_urgency === 'due').length,
    ok: patients.filter((patient) => patient.followup_urgency === 'ok').length,
  }

  const todayContacts = patients
    .filter((patient) => ['overdue', 'due', 'soon'].includes(patient.followup_urgency))
    .sort((a, b) => {
      const order = { overdue: 0, due: 1, soon: 2 }
      return order[a.followup_urgency] - order[b.followup_urgency]
    })
    .slice(0, 10)

  const selectedTodayContacts = useMemo(
    () => todayContacts.filter((patient) => selectedIds.includes(patient.id)),
    [todayContacts, selectedIds]
  )

  const defaultTemplate = useMemo(() => (
    whatsAppTemplates.find((template) => template.id === whatsAppConfig.default_template_id)
      || whatsAppTemplates.find((template) => template.is_default)
      || whatsAppTemplates[0]
      || null
  ), [whatsAppConfig.default_template_id, whatsAppTemplates])

  const kpiCards = [
    {
      label: 'Pacientes ativos',
      value: stats.total,
      icon: 'group',
      detail: 'Base acompanhada no momento',
    },
    {
      label: 'Contatos para hoje',
      value: stats.due,
      icon: 'calendar_month',
      detail: 'Marcos previstos para agora',
    },
    {
      label: 'Atrasados',
      value: stats.overdue,
      icon: 'warning',
      detail: 'Casos que pedem atencao imediata',
    },
    {
      label: 'Em dia',
      value: stats.ok,
      icon: 'check_circle',
      detail: 'Pacientes dentro do roteiro',
    },
  ]

  function togglePatient(patientId) {
    setSelectedIds((current) => (
      current.includes(patientId)
        ? current.filter((id) => id !== patientId)
        : [...current, patientId]
    ))
  }

  function toggleAllToday() {
    if (selectedTodayContacts.length === todayContacts.length && todayContacts.length > 0) {
      const idsToRemove = new Set(todayContacts.map((patient) => patient.id))
      setSelectedIds((current) => current.filter((id) => !idsToRemove.has(id)))
      return
    }

    setSelectedIds((current) => [...new Set([...current, ...todayContacts.map((patient) => patient.id)])])
  }

  function buildMessageForPatient(patient) {
    const templateSource =
      patient.protocol_message_template
      || defaultTemplate?.content
      || 'Ola, {primeiro_nome}. Aqui e da {clinica}. Passando para lembrar do seu acompanhamento de {procedimento}.'

    return renderWhatsAppMessage(templateSource, buildWhatsAppContext(patient, clinicName))
  }

  function appendPendingConfirmation(items) {
    setPendingConfirmation((current) => {
      const byId = new Map(current.map((item) => [item.patientId, item]))
      items.forEach((item) => byId.set(item.patientId, item))
      return Array.from(byId.values())
    })
  }

  function buildCallUrl(patient) {
    const phone = normalizePhone(patient.phone)
    if (!phone) return ''
    return `tel:+55${phone}`
  }

  function openCallForPatients(targetPatients) {
    const validPatients = targetPatients.filter((patient) => normalizePhone(patient.phone))
    if (validPatients.length === 0) {
      setSendError('Nenhum paciente selecionado possui telefone valido para ligacao.')
      return
    }

    const openedAt = new Date().toISOString().split('T')[0]
    let opened = 0

    validPatients.forEach((patient, index) => {
      const url = buildCallUrl(patient)
      if (!url) return
      window.setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), index * 300)
      opened += 1
    })

    appendPendingConfirmation(validPatients.map((patient) => ({
      patientId: patient.id,
      name: patient.name,
      phone: patient.phone,
      confirmed: true,
      templateName: 'Ligacao manual',
      openedAt,
      channel: 'call',
    })))

    setSentCount(opened)
    setSendError('')
    setConfirmationSuccess('')
    window.setTimeout(() => setSentCount(0), 4000)
  }

  function openWhatsAppForPatients(targetPatients) {
    if (!whatsAppConfig.enabled) {
      setSendError('A Central de WhatsApp esta desligada nas configuracoes atuais.')
      return
    }

    const validPatients = targetPatients.filter((patient) => normalizePhone(patient.phone))
    if (validPatients.length === 0) {
      setSendError('Nenhum paciente selecionado possui telefone valido para abrir no WhatsApp.')
      return
    }

    const openedAt = new Date().toISOString().split('T')[0]
    let opened = 0

    validPatients.forEach((patient, index) => {
      const message = buildMessageForPatient(patient)
      const url = buildWhatsAppUrl({
        phone: patient.phone,
        message,
        countryCode: whatsAppConfig.country_code || '55',
      })

      if (!url) return

      window.setTimeout(() => {
        window.open(url, '_blank', 'noopener,noreferrer')
      }, index * (whatsAppConfig.open_delay_ms || 800))
      opened += 1
    })

    appendPendingConfirmation(validPatients.map((patient) => ({
      patientId: patient.id,
      name: patient.name,
      phone: patient.phone,
      confirmed: true,
      templateName: patient.protocol_message_template ? 'Modelo do protocolo' : (defaultTemplate?.name || 'Modelo padrao'),
      openedAt,
      channel: 'whatsapp',
    })))

    setSentCount(opened)
    setSendError('')
    setConfirmationSuccess('')
    window.setTimeout(() => setSentCount(0), 4000)
  }

  async function handleRegisterConfirmedContacts() {
    const confirmedItems = pendingConfirmation.filter((item) => item.confirmed)
    if (confirmedItems.length === 0) {
      setSendError('Selecione ao menos um contato confirmado para registrar no historico.')
      return
    }

    setRegisteringContacts(true)
    try {
      await Promise.all(confirmedItems.map((item) => (
        api.followups.create({
          patient_id: item.patientId,
          contact_date: item.openedAt,
          contact_type: item.channel === 'call' ? 'call' : 'whatsapp',
          outcome: 'reached',
          notes: item.templateName
            ? `Contato confirmado pelo Dashboard via ${item.channel === 'call' ? 'Ligacao' : 'WhatsApp'}. Modelo usado: ${item.templateName}.`
            : `Contato confirmado pelo Dashboard via ${item.channel === 'call' ? 'Ligacao' : 'WhatsApp'}.`,
          is_extra_contact: 0,
        })
      )))

      const confirmedIds = new Set(confirmedItems.map((item) => item.patientId))
      setPendingConfirmation((current) => current.filter((item) => !confirmedIds.has(item.patientId)))
      setSelectedIds((current) => current.filter((id) => !confirmedIds.has(id)))
      setConfirmationSuccess(`${confirmedItems.length} contato(s) registrado(s) no historico com sucesso.`)
      setSendError('')
      window.setTimeout(() => setConfirmationSuccess(''), 4000)
    } catch (error) {
      setSendError(error.message || 'Nao foi possivel registrar os contatos confirmados.')
    } finally {
      setRegisteringContacts(false)
    }
  }

  function togglePendingConfirmation(patientId) {
    setPendingConfirmation((current) => current.map((item) => (
      item.patientId === patientId ? { ...item, confirmed: !item.confirmed } : item
    )))
  }

  const heroStyle = branding.backgroundImageUrl
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(22, 37, 32, 0.9), rgba(22, 37, 32, 0.54)), url("${branding.backgroundImageUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-outline-variant/60 bg-[#1c342c] text-[#f8f1e6] shadow-glow" style={heroStyle}>
        <div className="grid gap-8 px-6 py-7 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#d6c2a2]">Gestao de acompanhamento</p>
            <h1 className="mt-3 text-display-lg text-white">{branding.heroTitle}</h1>
            <p className="mt-4 max-w-2xl text-body-lg text-[#ece1cf]/90">{branding.heroSubtitle}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/patients/new" className="btn rounded-full bg-[#f5ead8] px-6 text-[#18352d] hover:bg-white">
                Novo paciente
              </Link>
              <Link to="/comunicacao" className="btn rounded-full border border-white/15 bg-white/8 px-6 text-white hover:bg-white/14">
                Abrir central de WhatsApp
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-white/10 bg-black/12 p-5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#d5c2a3]">Panorama imediato</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {kpiCards.slice(0, 4).map((card) => (
                  <div key={card.label} className="rounded-[22px] border border-white/10 bg-white/8 p-4">
                    <span className="material-symbols-outlined text-[#dcc390]">{card.icon}</span>
                    <p className="mt-3 text-3xl leading-none text-white">{loading ? '...' : card.value}</p>
                    <p className="mt-2 text-sm text-[#ebddc8]/88">{card.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <article key={card.label} className="card card-hover">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined rounded-full bg-primary/10 p-3 text-primary">{card.icon}</span>
              <span className="text-[11px] uppercase tracking-[0.22em] text-on-surface-variant">Resumo</span>
            </div>
            <p className="mt-6 text-5xl leading-none text-on-surface">{loading ? '...' : card.value}</p>
            <h3 className="mt-3 text-headline-sm text-on-surface">{card.label}</h3>
            <p className="mt-2 text-sm text-on-surface-variant">{card.detail}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <section className="card">
          <div className="flex flex-col gap-4 border-b border-outline-variant/55 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Agenda prioritaria</p>
              <h2 className="mt-2 text-display-md text-on-surface">Contatos de hoje</h2>
              {!loading && todayContacts.length > 0 && (
                <p className="mt-2 text-sm text-on-surface-variant">
                  Passe o mouse para contato individual ou selecione varios para contato em massa.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!loading && todayContacts.length > 0 && (
                <>
                  <button type="button" onClick={toggleAllToday} className="text-sm font-semibold text-primary hover:opacity-80">
                    {selectedTodayContacts.length === todayContacts.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCallForPatients(selectedTodayContacts)}
                    disabled={selectedTodayContacts.length === 0}
                    className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Ligacao
                  </button>
                  <button
                    type="button"
                    onClick={() => openWhatsAppForPatients(selectedTodayContacts)}
                    disabled={selectedTodayContacts.length === 0}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    WhatsApp
                  </button>
                </>
              )}

              <Link to="/patients" className="text-sm font-semibold text-primary hover:opacity-80">
                Ver todos
              </Link>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {loading ? (
              [1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-[24px] bg-surface-container-high" />)
            ) : todayContacts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-outline-variant bg-surface-container px-6 py-14 text-center">
                <span className="material-symbols-outlined fill-icon text-secondary" style={{ fontSize: '42px' }}>check_circle</span>
                <p className="text-lg font-semibold text-on-surface">Todos os contatos em dia.</p>
                <p className="max-w-md text-sm text-on-surface-variant">Quando houver pacientes para contato hoje, eles aparecerao aqui com acesso rapido para ligacao ou WhatsApp.</p>
              </div>
            ) : (
              todayContacts.map((patient) => {
                const cfg = urgencyConfig[patient.followup_urgency] ?? urgencyConfig.soon
                const hasPhone = !!normalizePhone(patient.phone)
                const isSelected = selectedIds.includes(patient.id)

                return (
                  <article
                    key={patient.id}
                    className={`group relative overflow-hidden rounded-[28px] border border-outline-variant/65 bg-surface-container-low p-5 ${isSelected ? 'ring-2 ring-primary/20' : ''}`}
                  >
                    <div className={`absolute left-0 top-0 h-full w-1.5 ${cfg.bar}`} />
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <label className="mt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePatient(patient.id)}
                            className="h-4 w-4 rounded border-outline-variant bg-transparent"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-headline-sm text-on-surface">{patient.name}</h3>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="mt-2 text-body-md text-on-surface-variant">{patient.procedure}</p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-on-surface-variant">
                            {patient.agent_name && <span>Responsavel: {patient.agent_name}</span>}
                            {patient.followup_label && <span>{patient.followup_label}</span>}
                            {!hasPhone && <span className="text-error">Sem telefone valido para contato.</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => openCallForPatients([patient])}
                          disabled={!hasPhone}
                          className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Ligacao
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppForPatients([patient])}
                          disabled={!hasPhone}
                          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          WhatsApp
                        </button>
                        <Link to={`/patients/${patient.id}`} className={`btn ${cfg.button}`}>
                          Registrar contato
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          {(sendError || sentCount > 0 || pendingConfirmation.length > 0 || confirmationSuccess) && (
            <div className="mt-6 space-y-4 rounded-[28px] border border-outline-variant/65 bg-surface-container p-5">
              {sendError && (
                <div className="rounded-2xl border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-error">
                  {sendError}
                </div>
              )}

              {sentCount > 0 && (
                <div className="rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm text-secondary">
                  {sentCount} acao(oes) aberta(s) para contato.
                </div>
              )}

              {pendingConfirmation.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-headline-sm text-on-surface">Confirmar envios do dashboard</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      Confirme apenas as mensagens realmente enviadas para registrar no historico.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {pendingConfirmation.map((item) => (
                      <label key={item.patientId} className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-outline-variant bg-surface px-4 py-3">
                        <input
                          type="checkbox"
                          checked={item.confirmed}
                          onChange={() => togglePendingConfirmation(item.patientId)}
                          className="mt-1 h-4 w-4 rounded border-outline-variant"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface">{item.name}</p>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            {item.channel === 'call' ? 'Ligacao' : 'WhatsApp'} - {item.phone} - Referencia: {item.templateName}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {confirmationSuccess && (
                    <div className="rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm text-secondary">
                      {confirmationSuccess}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 md:flex-row">
                    <button type="button" onClick={() => setPendingConfirmation([])} className="btn-ghost flex-1">
                      Limpar pendencias
                    </button>
                    <button
                      type="button"
                      onClick={handleRegisterConfirmedContacts}
                      disabled={registeringContacts}
                      className="btn-primary flex-1 disabled:opacity-50"
                    >
                      {registeringContacts ? 'Registrando...' : 'Confirmar e registrar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card">
            <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Atividade recente</p>
            <h2 className="mt-2 text-display-md text-on-surface">Movimentacao da central</h2>

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '38px' }}>notifications_none</span>
                <p className="text-sm text-on-surface-variant">Nenhuma atividade recente.</p>
              </div>
            ) : (
              <div className="relative mt-6 space-y-5 pl-8">
                <div className="absolute bottom-0 left-3 top-0 w-px bg-outline-variant/55" />
                {notifications.slice(0, 7).map((notification) => {
                  const cfg = activityConfig[notification.type] ?? activityConfig.followup_due
                  return (
                    <div key={notification.id} className="relative">
                      <div className={`absolute -left-8 top-1 flex h-6 w-6 items-center justify-center rounded-full ${cfg.bg}`}>
                        <span className={`material-symbols-outlined ${cfg.color}`} style={{ fontSize: '16px' }}>{cfg.icon}</span>
                      </div>
                      <p className="text-sm font-semibold text-on-surface">
                        {cfg.label}
                        {notification.patient_name && ` - ${notification.patient_name}`}
                      </p>
                      {notification.procedure && (
                        <p className="mt-1 text-sm text-on-surface-variant">{notification.procedure}</p>
                      )}
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-on-surface-variant">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card bg-[#f4ead8]">
            <p className="text-[11px] uppercase tracking-[0.26em] text-[#826746]">Direcao da marca</p>
            <h2 className="mt-2 text-headline-sm text-[#2b342f]">{branding.tagline}</h2>
            <p className="mt-3 text-sm leading-6 text-[#655443]">
              O painel agora combina acompanhamento clinico com uma linguagem mais institucional, mantendo seus fluxos atuais de contato e protocolo.
            </p>
            <div className="mt-5 flex gap-3">
              <Link to="/admin" className="btn rounded-full bg-[#26483e] text-[#f8f1e6] hover:opacity-95">
                Ajustar identidade
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
