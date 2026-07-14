import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/services/api'
import { formatProtocolDayShort, normalizeProtocolDays } from '@/utils/protocols'

const CONTACT_TYPE_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { value: 'email', label: 'Email', icon: 'mail' },
  { value: 'call', label: 'Ligação', icon: 'call' },
  { value: 'in_person', label: 'Presencial', icon: 'handshake' },
]

export default function MessageProtocolTab() {
  const [protocols, setProtocols] = useState([])
  const [templates, setTemplates] = useState([])
  const [placeholders, setPlaceholders] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalTemplate, setModalTemplate] = useState(null)
  const [delTarget, setDelTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [delError, setDelError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [protocolData, templateData, placeholderData] = await Promise.all([
        api.protocols.list(),
        api.messageProtocols.list(),
        api.messageProtocols.placeholders(),
      ])
      setProtocols(protocolData ?? [])
      setTemplates(templateData ?? [])
      setPlaceholders(placeholderData ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => {})
  }, [])

  const protocolsWithTemplates = useMemo(() => {
    return protocols.map((protocol) => {
      const protocolDays = normalizeProtocolDays(protocol.days)
      const protocolTemplates = templates
        .filter((template) => template.protocol_id === protocol.id)
        .sort((a, b) => Number(a.day_offset) - Number(b.day_offset))

      return {
        ...protocol,
        protocolDays,
        templates: protocolTemplates,
      }
    })
  }, [protocols, templates])

  async function handleDelete(template) {
    setDeleting(true)
    setDelError('')
    try {
      await api.messageProtocols.delete(template.id)
      setDelTarget(null)
      await load()
    } catch (err) {
      setDelError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-xl bg-surface-container-low" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-body-md text-on-surface-variant">
            {templates.length} mensagem{templates.length !== 1 ? 'ens' : ''} protocolar{templates.length !== 1 ? 'es' : ''} cadastrada{templates.length !== 1 ? 's' : ''}
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Cada mensagem fica vinculada a um marco real do protocolo de contatos e depois aparece no registro do paciente.
          </p>
        </div>
        <button
          onClick={() => setModalTemplate({})}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary transition-opacity hover:opacity-90 ambient-shadow-lvl1"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Nova mensagem
        </button>
      </div>

      {protocolsWithTemplates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface p-10 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>forum</span>
          <p className="text-label-md">Crie primeiro um protocolo de contatos para depois vincular mensagens.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {protocolsWithTemplates.map((protocol) => (
            <section key={protocol.id} className="rounded-xl border border-outline-variant bg-surface p-5 ambient-shadow-lvl1">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: protocol.color || '#6366f1' }} />
                    <h3 className="text-label-md font-semibold text-on-surface">{protocol.name}</h3>
                    {protocol.is_default ? (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-label-sm text-primary">
                        Padrão
                      </span>
                    ) : null}
                    <span className="text-label-sm text-outline">
                      {protocol.templates.length}/{protocol.protocolDays.length} marcos com mensagem
                    </span>
                  </div>
                  {protocol.description && (
                    <p className="mt-1 text-body-md text-on-surface-variant">{protocol.description}</p>
                  )}
                </div>

                <button
                  onClick={() => setModalTemplate({ protocol_id: protocol.id })}
                  className="rounded-lg border border-outline-variant px-3 py-1.5 text-label-sm text-on-surface transition-colors hover:bg-surface-container-low"
                >
                  Adicionar
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {protocol.protocolDays.map((day) => {
                  const linkedTemplate = protocol.templates.find((template) => Number(template.day_offset) === Number(day))
                  return (
                    <span
                      key={day}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        linkedTemplate
                          ? 'border-secondary/30 bg-secondary/10 text-secondary'
                          : 'border-outline-variant bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {formatProtocolDayShort(day)}
                    </span>
                  )
                })}
              </div>

              {protocol.templates.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-5 text-sm text-on-surface-variant">
                  Nenhuma mensagem criada ainda para este protocolo.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {protocol.templates.map((template) => (
                    <article key={template.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {formatProtocolDayShort(template.day_offset)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant">
                              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                                {CONTACT_TYPE_OPTIONS.find((option) => option.value === template.contact_type)?.icon ?? 'chat'}
                              </span>
                              {CONTACT_TYPE_OPTIONS.find((option) => option.value === template.contact_type)?.label ?? template.contact_type}
                            </span>
                          </div>
                          <h4 className="mt-2 text-label-md font-semibold text-on-surface">{template.title}</h4>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">
                            {template.content}
                          </p>
                        </div>

                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => setModalTemplate(template)}
                            className="rounded p-1.5 text-outline transition-colors hover:bg-surface hover:text-primary"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                          </button>
                          <button
                            onClick={() => { setDelTarget(template); setDelError('') }}
                            className="rounded p-1.5 text-outline transition-colors hover:bg-error-container/20 hover:text-error"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {modalTemplate !== null && (
        <MessageProtocolModal
          template={modalTemplate.id ? modalTemplate : null}
          protocols={protocols}
          placeholders={placeholders}
          defaultProtocolId={modalTemplate.protocol_id || ''}
          onClose={() => setModalTemplate(null)}
          onSaved={load}
        />
      )}

      {delTarget && (
        <Modal open onClose={() => setDelTarget(null)} title="Excluir mensagem protocolar">
          <p className="mb-4 text-body-md text-on-surface-variant">
            Tem certeza que deseja excluir a mensagem <strong className="text-on-surface">{delTarget.title}</strong>?
          </p>
          {delError && <p className="mb-4 rounded-lg bg-error-container/20 px-3 py-2 text-label-sm text-error">{delError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setDelTarget(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={() => handleDelete(delTarget)} disabled={deleting} className="btn-danger flex-1">
              {deleting ? <Spinner /> : 'Excluir'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MessageProtocolModal({ template, protocols, placeholders, defaultProtocolId, onClose, onSaved }) {
  const isEdit = Boolean(template)
  const [protocolId, setProtocolId] = useState(template?.protocol_id ?? defaultProtocolId ?? '')
  const [dayOffset, setDayOffset] = useState(
    template?.day_offset != null ? String(template.day_offset) : ''
  )
  const [title, setTitle] = useState(template?.title ?? '')
  const [content, setContent] = useState(template?.content ?? '')
  const [contactType, setContactType] = useState(template?.contact_type ?? 'whatsapp')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedProtocol = useMemo(
    () => protocols.find((protocol) => protocol.id === protocolId) ?? null,
    [protocols, protocolId]
  )

  const selectedDays = useMemo(
    () => normalizeProtocolDays(selectedProtocol?.days ?? []),
    [selectedProtocol]
  )

  useEffect(() => {
    if (!selectedDays.length) {
      setDayOffset('')
      return
    }

    const hasCurrentDay = selectedDays.includes(Number(dayOffset))
    if (!hasCurrentDay) {
      setDayOffset(String(selectedDays[0]))
    }
  }, [selectedDays, dayOffset])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        protocol_id: protocolId,
        day_offset: Number(dayOffset),
        title,
        content,
        contact_type: contactType,
      }

      if (isEdit) await api.messageProtocols.update(template.id, payload)
      else await api.messageProtocols.create(payload)

      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Editar mensagem — ${template.title}` : 'Nova mensagem protocolar'} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Protocolo de contato</label>
            <select
              className="input"
              value={protocolId}
              onChange={(event) => {
                setProtocolId(event.target.value)
                setError('')
              }}
            >
              <option value="">Selecione um protocolo</option>
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>
                  {protocol.name}{protocol.is_default ? ' (Padrão)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Marco do protocolo</label>
            <select
              className="input"
              value={dayOffset}
              onChange={(event) => {
                setDayOffset(event.target.value)
                setError('')
              }}
              disabled={!selectedProtocol}
            >
              <option value="">Selecione o marco</option>
              {selectedDays.map((day) => (
                <option key={day} value={day}>
                  {formatProtocolDayShort(day)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Forma sugerida de contato</label>
            <select
              className="input"
              value={contactType}
              onChange={(event) => setContactType(event.target.value)}
            >
              {CONTACT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Nome da mensagem</label>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Boas-vindas no dia da cirurgia"
          />
        </div>

        <div>
          <label className="label">Texto da mensagem</label>
          <textarea
            className="input min-h-[180px] resize-y"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Olá, {{patient_name}}! ..."
          />
          <p className="mt-2 text-[11px] text-on-surface-variant">
            O sistema substitui automaticamente os placeholders quando a mensagem aparecer no registro de contato do paciente.
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
          <p className="text-label-sm font-semibold text-on-surface">Placeholders disponíveis</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {placeholders.map((item) => (
              <span key={item.key} className="rounded-full border border-outline-variant bg-surface px-2 py-1 text-[11px] text-on-surface-variant">
                {`{{${item.key}}}`} · {item.label}
              </span>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-error-container/20 px-3 py-2 text-label-sm text-error">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Spinner /> : isEdit ? 'Salvar alterações' : 'Criar mensagem'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ open, onClose, title, children, wide = false }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed left-1/2 top-[8vh] z-50 w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-modal ${wide ? 'max-w-[108rem]' : 'max-w-[81rem]'}`}
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <h3 className="text-headline-sm font-headline-sm text-on-surface">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
}
