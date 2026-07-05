import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/services/api'
import { useAuthStore, useSettingsStore } from '@/store'
import { buildWhatsAppContext, buildWhatsAppUrl, normalizePhone, renderWhatsAppMessage } from '@/utils/whatsapp'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativos' },
  { value: 'paused', label: 'Pausados' },
  { value: 'discharged', label: 'Alta' },
  { value: '', label: 'Todos' },
]

const EMPTY_TEMPLATE = {
  id: null,
  name: '',
  description: '',
  content: '',
  is_default: false,
  is_active: true,
}

const CHANNEL_TABS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
]

export default function WhatsApp() {
  const clinicName = useSettingsStore((state) => state.settings.clinic_name || 'CareDesk')
  const isAdmin = useAuthStore((state) => state.isAdmin())

  const [patients, setPatients] = useState([])
  const [agents, setAgents] = useState([])
  const [templates, setTemplates] = useState([])
  const [config, setConfig] = useState({ enabled: true, country_code: '55', open_delay_ms: 800, default_template_id: '' })
  const [loading, setLoading] = useState(true)
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [activeChannel, setActiveChannel] = useState('whatsapp')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [agentId, setAgentId] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [expandedPreview, setExpandedPreview] = useState(true)
  const [sentCount, setSentCount] = useState(0)
  const [error, setError] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(EMPTY_TEMPLATE)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSuccess, setConfigSuccess] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [deletingTemplateId, setDeletingTemplateId] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState([])
  const [registeringContacts, setRegisteringContacts] = useState(false)
  const [confirmationSuccess, setConfirmationSuccess] = useState('')

  useEffect(() => {
    loadPatients()
    api.agents.list().then((data) => setAgents(data ?? [])).catch(() => {})
    loadWhatsAppData()
  }, [])

  async function loadPatients() {
    setLoading(true)
    try {
      const data = await api.patients.list({})
      setPatients(data ?? [])
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os pacientes')
    } finally {
      setLoading(false)
    }
  }

  async function loadWhatsAppData() {
    setLoadingTemplates(true)
    try {
      const [nextConfig, nextTemplates] = await Promise.all([
        api.whatsapp.getConfig(),
        api.whatsapp.listTemplates(),
      ])
      setConfig(nextConfig ?? {})
      setTemplates(nextTemplates ?? [])
      setTemplateId(nextConfig?.default_template_id || nextTemplates?.find((template) => template.is_default)?.id || nextTemplates?.[0]?.id || '')
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as configurações do WhatsApp')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      if (status && patient.status !== status) return false
      if (agentId && patient.assigned_agent_id !== agentId) return false
      if (!search.trim()) return true

      const term = search.trim().toLowerCase()
      return (
        patient.name?.toLowerCase().includes(term) ||
        patient.phone?.includes(search.trim()) ||
        patient.procedure?.toLowerCase().includes(term)
      )
    })
  }, [patients, status, agentId, search])

  const selectedPatients = useMemo(
    () => patients.filter((patient) => selectedIds.includes(patient.id)),
    [patients, selectedIds]
  )
  const visibleSelectedCount = useMemo(
    () => filteredPatients.filter((patient) => selectedIds.includes(patient.id)).length,
    [filteredPatients, selectedIds]
  )

  const selectedTemplate = templates.find((template) => template.id === templateId) || null
  const previewPatient = selectedPatients[0] || filteredPatients[0] || null
  const previewMessage = previewPatient && selectedTemplate
    ? renderWhatsAppMessage(selectedTemplate.content, buildWhatsAppContext(previewPatient, clinicName))
    : ''

  const patientsWithoutPhone = selectedPatients.filter((patient) => !normalizePhone(patient.phone))

  function togglePatient(id) {
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ))
  }

  function toggleAll() {
    if (visibleSelectedCount === filteredPatients.length && filteredPatients.length > 0) {
      const visibleIds = new Set(filteredPatients.map((patient) => patient.id))
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)))
      return
    }
    setSelectedIds((current) => [...new Set([...current, ...filteredPatients.map((patient) => patient.id)])])
  }

  function openManageTemplate(template = EMPTY_TEMPLATE) {
    setEditingTemplate({
      ...EMPTY_TEMPLATE,
      ...template,
    })
    setTemplateError('')
    setManageOpen(true)
  }

  async function handleSaveTemplate(event) {
    event.preventDefault()
    setSavingTemplate(true)
    setTemplateError('')

    try {
      const payload = {
        name: editingTemplate.name,
        description: editingTemplate.description,
        content: editingTemplate.content,
        is_default: editingTemplate.is_default,
        is_active: editingTemplate.is_active,
      }

      let saved
      if (editingTemplate.id) {
        saved = await api.whatsapp.updateTemplate(editingTemplate.id, payload)
      } else {
        saved = await api.whatsapp.createTemplate(payload)
      }

      await loadWhatsAppData()
      setTemplateId(saved.id)
      setManageOpen(false)
    } catch (err) {
      setTemplateError(err.message || 'Não foi possível salvar o modelo')
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleDeleteTemplate(id) {
    setDeletingTemplateId(id)
    try {
      await api.whatsapp.deleteTemplate(id)
      if (templateId === id) setTemplateId('')
      await loadWhatsAppData()
    } catch (err) {
      setTemplateError(err.message || 'Não foi possível remover o modelo')
    } finally {
      setDeletingTemplateId('')
    }
  }

  function insertVariable(variable) {
    setEditingTemplate((current) => ({
      ...current,
      content: `${current.content}${current.content ? ' ' : ''}${variable}`,
    }))
  }

  async function handleSaveConfig() {
    setSavingConfig(true)
    try {
      await api.whatsapp.updateConfig(config)
      setConfigSuccess(true)
      setError('')
      window.setTimeout(() => setConfigSuccess(false), 3000)
    } catch (err) {
      setError(err.message || 'Não foi possível salvar as preferências do WhatsApp')
    } finally {
      setSavingConfig(false)
    }
  }

  function openWhatsAppForPatients(targetPatients) {
    if (!config.enabled) {
      setError('A Central de WhatsApp está desligada nas configurações.')
      return
    }

    if (!selectedTemplate) {
      setError('Selecione um modelo de mensagem antes de enviar.')
      return
    }

    const validPatients = targetPatients.filter((patient) => normalizePhone(patient.phone))
    let opened = 0
    const openedAt = new Date().toISOString().split('T')[0]

    validPatients.forEach((patient, index) => {
      const message = renderWhatsAppMessage(selectedTemplate.content, buildWhatsAppContext(patient, clinicName))
      const url = buildWhatsAppUrl({
        phone: patient.phone,
        message,
        countryCode: config.country_code || '55',
      })

      if (!url) return

      window.setTimeout(() => {
        window.open(url, '_blank', 'noopener,noreferrer')
      }, index * (config.open_delay_ms || 800))
      opened += 1
    })

    setSentCount(opened)
    setPendingConfirmation(validPatients.map((patient) => ({
      patientId: patient.id,
      name: patient.name,
      phone: patient.phone,
      confirmed: true,
      templateName: selectedTemplate.name,
      openedAt,
      channel: 'whatsapp',
    })))
    setConfirmationSuccess('')
    setError('')
    window.setTimeout(() => setSentCount(0), 4000)
  }

  function handleSendAll() {
    openWhatsAppForPatients(selectedPatients)
  }

  function togglePendingConfirmation(patientId) {
    setPendingConfirmation((current) => current.map((item) => (
      item.patientId === patientId ? { ...item, confirmed: !item.confirmed } : item
    )))
  }

  async function handleRegisterConfirmedContacts() {
    const confirmedItems = pendingConfirmation.filter((item) => item.confirmed)
    if (confirmedItems.length === 0) {
      setError('Selecione ao menos um contato confirmado para registrar no histórico.')
      return
    }

    setRegisteringContacts(true)
    try {
      await Promise.all(confirmedItems.map((item) => (
        api.followups.create({
          patient_id: item.patientId,
          contact_date: item.openedAt,
          contact_type: 'whatsapp',
          outcome: 'reached',
          notes: item.templateName
            ? `Contato confirmado pela Central de WhatsApp. Modelo usado: ${item.templateName}.`
            : 'Contato confirmado pela Central de WhatsApp.',
          is_extra_contact: 0,
        })
      )))

      const confirmedIds = new Set(confirmedItems.map((item) => item.patientId))
      setPendingConfirmation((current) => current.filter((item) => !confirmedIds.has(item.patientId)))
      setSelectedIds((current) => current.filter((id) => !confirmedIds.has(id)))
      setConfirmationSuccess(`${confirmedItems.length} contato(s) registrado(s) no histórico com sucesso.`)
      setError('')
      window.setTimeout(() => setConfirmationSuccess(''), 4000)
    } catch (err) {
      setError(err.message || 'Não foi possível registrar os contatos confirmados.')
    } finally {
      setRegisteringContacts(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-display-lg font-display-lg text-on-surface">Central de WhatsApp</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Gerencie o contato manual por WhatsApp com modelos prontos e seleção em massa de pacientes.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeChannel === 'whatsapp' && (
            <span className={`px-3 py-1 rounded-full text-label-sm font-label-sm border ${
              config.enabled
                ? 'bg-secondary/10 border-secondary/30 text-secondary'
                : 'bg-error-container/20 border-error/20 text-error'
            }`}>
              {config.enabled ? 'Central ligada' : 'Central desligada'}
            </span>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => openManageTemplate()}
              className="px-4 py-2 rounded-lg border border-outline-variant bg-surface text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
            >
              Novo modelo
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit border border-outline-variant">
        {CHANNEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveChannel(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-label-md font-label-md transition-all ${
              activeChannel === tab.id
                ? 'bg-surface text-on-surface ambient-shadow-lvl1'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-error/30 bg-error-container/20 px-4 py-3 text-label-sm text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {isAdmin && activeChannel === 'whatsapp' && (
            <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant/40">
                <h2 className="text-headline-sm font-headline-sm text-on-surface">Preferências da Central</h2>
                <p className="text-label-sm text-on-surface-variant mt-1">
                  Controle o comportamento do WhatsApp manual em um único lugar.
                </p>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4">
                  <div>
                    <p className="text-label-md font-label-md text-on-surface">Central ativa</p>
                    <p className="text-label-sm text-on-surface-variant">Desative se quiser esconder o uso do WhatsApp sem apagar modelos.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfig((current) => ({ ...current, enabled: !current.enabled }))
                      setConfigSuccess(false)
                    }}
                    className={`rounded-xl border px-4 py-2 text-label-md font-label-md transition-colors ${
                      config.enabled
                        ? 'bg-secondary/10 border-secondary/30 text-secondary'
                        : 'bg-surface border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {config.enabled ? 'Ligado' : 'Desligado'}
                  </button>
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface-container-low overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((current) => !current)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface/40 transition-colors"
                  >
                    <div>
                      <p className="text-label-md font-label-md text-on-surface">Configurações avançadas</p>
                      <p className="text-label-sm text-on-surface-variant mt-1">
                        Ajustes opcionais para abertura das conversas no WhatsApp.
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {advancedOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {advancedOpen && (
                    <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-outline-variant/40">
                      <div className="pt-4">
                        <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1.5">DDI padrão</label>
                        <input
                          className="w-full px-4 py-2 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={config.country_code || '55'}
                          onChange={(event) => {
                            setConfig((current) => ({ ...current, country_code: event.target.value }))
                            setConfigSuccess(false)
                          }}
                          placeholder="55"
                        />
                      </div>
                      <div className="pt-4">
                        <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1.5">Intervalo entre abas (ms)</label>
                        <input
                          type="number"
                          min="200"
                          max="5000"
                          step="100"
                          className="w-full px-4 py-2 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={config.open_delay_ms || 800}
                          onChange={(event) => {
                            setConfig((current) => ({ ...current, open_delay_ms: Number(event.target.value || 800) }))
                            setConfigSuccess(false)
                          }}
                          placeholder="800"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {configSuccess ? (
                    <p className="text-label-sm text-secondary bg-secondary/10 px-3 py-2 rounded-lg">
                      Preferências salvas com sucesso.
                    </p>
                  ) : <span />}
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="px-5 py-3 rounded-xl bg-primary text-on-primary text-label-md font-label-md hover:opacity-95 transition-opacity disabled:opacity-50"
                  >
                    {savingConfig ? 'Salvando...' : 'Salvar preferências'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/40 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-headline-sm font-headline-sm text-on-surface">Selecionar pacientes</h2>
                <p className="text-label-sm text-on-surface-variant">
                  {selectedPatients.length} selecionado(s) • {filteredPatients.length} visível(is)
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAll}
                className="text-label-sm text-primary hover:text-primary-fixed-dim transition-colors"
              >
                {visibleSelectedCount === filteredPatients.length && filteredPatients.length > 0 ? 'Desmarcar visíveis' : 'Selecionar visíveis'}
              </button>
            </div>

            <div className="p-4 border-b border-outline-variant/40 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  className="w-full px-4 py-2 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                placeholder="Buscar por nome, telefone ou procedimento"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="relative">
                <select
                  className="w-full appearance-none px-4 py-2 pr-10 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
              </div>
              <div className="relative">
                <select
                  className="w-full appearance-none px-4 py-2 pr-10 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  <option value="">Todos os responsáveis</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
              </div>
            </div>

            <div className="max-h-[620px] overflow-y-auto">
              {loading ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="h-20 rounded-xl bg-surface-container-low animate-pulse" />
                  ))}
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="px-6 py-14 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined mb-3" style={{ fontSize: '42px' }}>chat</span>
                  <p className="text-label-md">Nenhum paciente encontrado para esse filtro.</p>
                </div>
              ) : (
                filteredPatients.map((patient) => {
                  const isSelected = selectedIds.includes(patient.id)
                  const hasContact = !!normalizePhone(patient.phone)

                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => togglePatient(patient.id)}
                      className={`w-full text-left px-5 py-4 border-b border-outline-variant/30 transition-colors ${
                        isSelected ? 'bg-primary/6' : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary mt-0.5">
                          {isSelected ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-label-md font-label-md text-on-surface truncate">{patient.name}</p>
                            <span className="text-label-sm text-on-surface-variant whitespace-nowrap">
                              {patient.agent_name || 'Não atribuído'}
                            </span>
                          </div>
                          <p className="text-body-sm text-on-surface-variant mt-1 truncate">
                            {patient.procedure} • Cirurgia em {patient.surgery_date || '—'}
                          </p>
                          <p className={`text-label-sm mt-2 ${hasContact ? 'text-on-surface-variant' : 'text-error'}`}>
                            {hasContact ? patient.phone : 'Sem telefone cadastrado'}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-4"
        >
          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/40">
              <h2 className="text-headline-sm font-headline-sm text-on-surface">Modelo de mensagem</h2>
              <p className="text-label-sm text-on-surface-variant mt-1">
                Escolha um texto salvo para abrir conversas. Os campos são preenchidos automaticamente para cada paciente.
              </p>
            </div>
            <div className="p-4 space-y-2">
              {loadingTemplates ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-16 rounded-xl bg-surface-container-low animate-pulse" />
                  ))}
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-6 text-center text-on-surface-variant">
                  Nenhum modelo salvo ainda.
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      templateId === template.id
                        ? 'border-primary bg-primary/8'
                        : 'border-outline-variant bg-surface-container-low'
                    } ${!template.is_active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-3 justify-between">
                      <button type="button" className="text-left flex-1 min-w-0" onClick={() => setTemplateId(template.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-label-md font-label-md text-on-surface">{template.name}</p>
                          {template.is_default && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-label-sm">
                              Padrão
                            </span>
                          )}
                          {!template.is_active && (
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-outline-variant text-on-surface-variant text-label-sm">
                              Inativo
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-body-sm text-on-surface-variant mt-1">{template.description}</p>
                        )}
                      </button>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => openManageTemplate(template)} className="p-2 rounded-lg hover:bg-surface text-on-surface-variant hover:text-primary transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(template.id)}
                            disabled={deletingTemplateId === template.id}
                            className="p-2 rounded-lg hover:bg-error-container/20 text-on-surface-variant hover:text-error transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                              {deletingTemplateId === template.id ? 'hourglass_top' : 'delete'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedPreview((current) => !current)}
              className="w-full px-5 py-4 border-b border-outline-variant/40 flex items-center justify-between"
            >
              <div className="text-left">
                <h2 className="text-headline-sm font-headline-sm text-on-surface">Pré-visualização</h2>
                <p className="text-label-sm text-on-surface-variant mt-1">
                  {previewPatient ? `Usando ${previewPatient.name}` : 'Selecione um paciente para visualizar'}
                </p>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">
                {expandedPreview ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {expandedPreview && (
              <div className="p-4">
                <div className="rounded-xl border border-outline-variant bg-[#dff5e7] dark:bg-secondary/10 px-4 py-4">
                  <pre className="whitespace-pre-wrap font-sans text-body-md text-on-surface leading-relaxed">
                    {previewMessage || 'Selecione um modelo e ao menos um paciente para visualizar a mensagem.'}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-4 space-y-3">
            <div>
              <h2 className="text-headline-sm font-headline-sm text-on-surface">Envio manual</h2>
              <p className="text-label-sm text-on-surface-variant mt-1">
                {`O sistema abre uma conversa por paciente no WhatsApp Web/App usando o DDI ${config.country_code || '55'}.`}
              </p>
            </div>

            {patientsWithoutPhone.length > 0 && (
              <div className="rounded-xl border border-[#f6c26b]/40 bg-[#fff7e8] dark:bg-[#3b3020] px-4 py-3 text-label-sm text-[#9a6700] dark:text-[#f5c978]">
                {patientsWithoutPhone.length} paciente(s) sem telefone serão ignorados nesse envio.
              </div>
            )}

            {sentCount > 0 && (
              <div className="rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-label-sm text-secondary">
                {sentCount} conversa(s) aberta(s) com sucesso.
              </div>
            )}

            <button
              type="button"
              onClick={handleSendAll}
              disabled={!config.enabled || selectedPatients.length === 0 || !selectedTemplate}
              className="w-full py-3 rounded-xl bg-primary text-on-primary text-label-md font-label-md hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Abrir WhatsApp para{' '}
              {selectedPatients.length > 0 ? `${selectedPatients.length} paciente(s)` : 'os pacientes selecionados'}
            </button>

            <p className="text-label-sm text-on-surface-variant text-center">
              Permita pop-ups no navegador para abrir várias conversas em sequência.
            </p>
          </div>

          {pendingConfirmation.length > 0 && (
            <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-4 space-y-4">
              <div>
                <h2 className="text-headline-sm font-headline-sm text-on-surface">Confirmar envios</h2>
                <p className="text-label-sm text-on-surface-variant mt-1">
                  Abrir o canal não registra o contato automaticamente. Confirme abaixo somente as mensagens que realmente foram enviadas.
                </p>
              </div>

              <div className="space-y-2">
                {pendingConfirmation.map((item) => (
                  <label
                    key={item.patientId}
                    className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={item.confirmed}
                      onChange={() => togglePendingConfirmation(item.patientId)}
                      className="mt-1 w-4 h-4 rounded border-outline-variant"
                    />
                    <div className="min-w-0">
                      <p className="text-label-md font-label-md text-on-surface">{item.name}</p>
                      <p className="text-label-sm text-on-surface-variant mt-1">
                        WhatsApp • {item.phone} • Modelo: {item.templateName || 'Sem nome'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              {confirmationSuccess && (
                <div className="rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-label-sm text-secondary">
                  {confirmationSuccess}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingConfirmation([])}
                  className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  Limpar pendências
                </button>
                <button
                  type="button"
                  onClick={handleRegisterConfirmedContacts}
                  disabled={registeringContacts}
                  className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-label-md font-label-md hover:opacity-95 transition-opacity disabled:opacity-50"
                >
                  {registeringContacts ? 'Registrando...' : 'Confirmar e registrar no histórico'}
                </button>
              </div>
            </div>
          )}
        </motion.section>
      </div>

      <AnimatePresence>
        {manageOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => !savingTemplate && setManageOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-x-4 top-[6vh] z-50 max-w-3xl mx-auto bg-surface rounded-2xl border border-outline-variant shadow-modal overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
                <div>
                  <h3 className="text-headline-sm font-headline-sm text-on-surface">
                    {editingTemplate.id ? 'Editar modelo' : 'Novo modelo de mensagem'}
                  </h3>
                  <p className="text-label-sm text-on-surface-variant mt-1">
                    Crie mensagens reutilizáveis para WhatsApp com preenchimento automático dos dados do paciente.
                  </p>
                </div>
                <button type="button" onClick={() => !savingTemplate && setManageOpen(false)} className="p-2 rounded-lg hover:bg-surface-container-low text-on-surface-variant">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveTemplate} className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1.5">Nome do modelo *</label>
                    <input
                      className="w-full px-4 py-2 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                      value={editingTemplate.name}
                      onChange={(event) => setEditingTemplate((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Ex: Lembrete de retorno"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1.5">Descrição curta</label>
                    <input
                      className="w-full px-4 py-2 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                      value={editingTemplate.description}
                      onChange={(event) => setEditingTemplate((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Quando usar este texto"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1.5">Mensagem *</label>
                  <textarea
                    className="w-full min-h-[180px] px-4 py-3 bg-background border border-outline-variant rounded-lg text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-y"
                    value={editingTemplate.content}
                    onChange={(event) => setEditingTemplate((current) => ({ ...current, content: event.target.value }))}
                    placeholder="Use variáveis como {primeiro_nome}, {procedimento}, {data_cirurgia} e {clinica}."
                  />
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                  <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-3">Variáveis disponíveis</p>
                  <div className="flex flex-wrap gap-2">
                    {(config.available_variables || []).map((variable) => (
                      <button
                        key={variable.key}
                        type="button"
                        onClick={() => insertVariable(variable.key)}
                        className="px-2 py-1 rounded-full border border-outline-variant bg-surface text-label-sm text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                        title={variable.label}
                      >
                        {variable.key}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingTemplate.is_default}
                      onChange={(event) => setEditingTemplate((current) => ({ ...current, is_default: event.target.checked }))}
                      className="w-4 h-4 rounded border-outline-variant"
                    />
                    <span className="text-body-md text-on-surface">Usar como modelo padrão</span>
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingTemplate.is_active}
                      onChange={(event) => setEditingTemplate((current) => ({ ...current, is_active: event.target.checked }))}
                      className="w-4 h-4 rounded border-outline-variant"
                    />
                    <span className="text-body-md text-on-surface">Modelo ativo para seleção</span>
                  </label>
                </div>

                {templateError && (
                  <div className="rounded-xl border border-error/30 bg-error-container/20 px-4 py-3 text-label-sm text-error">
                    {templateError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setManageOpen(false)} className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container-low transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingTemplate} className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-label-md font-label-md hover:opacity-95 transition-opacity disabled:opacity-50">
                    {savingTemplate ? 'Salvando...' : 'Salvar modelo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
