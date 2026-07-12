import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/services/api'
import BrandingSettingsTab from '@/components/admin/BrandingSettingsTab'
import { useAuthStore, useSettingsStore } from '@/store'
import { VISUAL_THEMES } from '@/theme/visualThemes'
import { formatProtocolDayShort, normalizeProtocolDays } from '@/utils/protocols'
import Avatar from '@/components/common/Avatar'

const TABS = [
  { id: 'protocol', label: 'Protocolo de Contatos', icon: 'route' },
  { id: 'agents',   label: 'Equipe',            icon: 'group' },
  { id: 'settings', label: 'Identidade Visual', icon: 'palette' },
]

export default function Admin() {
  const [tab, setTab] = useState('protocol')

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-display-md font-display-md text-on-surface">Administração</h1>
        <p className="text-body-md text-on-surface-variant mt-0.5">
          Gerencie o protocolo de contatos, sua equipe e as configurações da clínica
        </p>
      </div>

      {/* Tabs MD3 */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit border border-outline-variant">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-label-md font-label-md transition-all
              ${tab === id
                ? 'bg-surface text-on-surface ambient-shadow-lvl1'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: .18 }}
        >
          {tab === 'protocol' && <ProtocolTab />}
          {tab === 'agents'   && <AgentsTab />}
          {tab === 'settings' && <BrandingSettingsTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Tab: Protocolo de Contatos ───────────────────────────────────
function ProtocolTab() {
  const [protocols, setProtocols] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalProto, setModalProto] = useState(null)   // null | {} (new) | {id,...} (edit)
  const [delTarget, setDelTarget] = useState(null)
  const [deleting, setDeleting]   = useState(false)
  const [delError, setDelError]   = useState('')

  async function load() {
    setLoading(true)
    api.protocols.list().then(setProtocols).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function handleDelete(proto) {
    setDeleting(true)
    setDelError('')
    try {
      await api.protocols.delete(proto.id)
      setDelTarget(null)
      load()
    } catch (err) {
      setDelError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="space-y-3">
      {[1,2].map(i => <div key={i} className="h-32 bg-surface-container-low rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-body-md text-on-surface-variant">
          {protocols.length} protocolo{protocols.length !== 1 ? 's' : ''} configurado{protocols.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setModalProto({})}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:opacity-90 transition-opacity ambient-shadow-lvl1 flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Novo protocolo
        </button>
      </div>

      {/* Lista de protocolos */}
      {protocols.length === 0 ? (
        <div className="bg-surface rounded-xl border border-outline-variant p-10 flex flex-col items-center gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>route</span>
          <p className="text-label-md">Nenhum protocolo criado ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {protocols.map(proto => {
            const days = normalizeProtocolDays(proto.days)
            const maxDay = days.filter(d => d > 0).length ? Math.max(...days.filter(d => d > 0)) : 0
            return (
              <div key={proto.id} className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: proto.color || '#6366f1' }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-label-md font-label-md text-on-surface font-semibold">{proto.name}</h3>
                        {proto.is_default ? (
                          <span className="px-2 py-0.5 rounded-full text-label-sm font-label-sm bg-primary/10 border border-primary/20 text-primary">Padrão</span>
                        ) : null}
                        <span className="text-label-sm text-outline">{days.length} marcos · até {maxDay}d após cirurgia</span>
                        {proto.patient_count > 0 && (
                          <span className="text-label-sm text-on-surface-variant flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>group</span>
                            {proto.patient_count} paciente{proto.patient_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {proto.description && <p className="text-body-md text-outline mt-0.5 truncate">{proto.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setModalProto(proto)}
                      className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                    </button>
                    <button
                      onClick={() => { setDelTarget(proto); setDelError('') }}
                      className="p-1.5 text-outline hover:text-error rounded hover:bg-error-container/20 transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  </div>
                </div>
                {/* Preview compacto */}
                {days.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <div className="flex items-center gap-1" style={{ minWidth: 'max-content' }}>
                      {days.map((d, i) => (
                        <div key={d} className="flex items-center">
                          {i > 0 && <div className="w-3 h-px bg-outline-variant" />}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            d < 0  ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
                                   : d === 0 ? 'bg-primary/10 border-primary/30 text-primary'
                                   : 'bg-secondary/10 border-secondary/30 text-secondary'
                          }`}>
                            {formatProtocolDayShort(d)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar/editar */}
      {modalProto !== null && (
        <ProtocolModal
          proto={modalProto.id ? modalProto : null}
          onClose={() => setModalProto(null)}
          onSaved={load}
        />
      )}

      {/* Modal confirmar exclusão */}
      {delTarget && (
        <Modal open onClose={() => setDelTarget(null)} title="Excluir protocolo">
          <p className="text-body-md text-on-surface-variant mb-4">
            Tem certeza que deseja excluir o protocolo <strong className="text-on-surface">{delTarget.name}</strong>?
          </p>
          {delError && <p className="text-label-sm text-error bg-error-container/20 px-3 py-2 rounded-lg mb-4">{delError}</p>}
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

// ── Modal de criar/editar protocolo ──────────────────────────
function ProtocolModal({ proto, onClose, onSaved }) {
  const isEdit = !!proto
  const [name, setName]           = useState(proto?.name ?? '')
  const [description, setDesc]    = useState(proto?.description ?? '')
  const [color, setColor]         = useState(proto?.color ?? '#6366f1')
  const [isDefault, setIsDefault] = useState(proto?.is_default === 1)
  const [days, setDays]           = useState(Array.isArray(proto?.days) ? [...proto.days] : [])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Adicionar dia manual
  const [addType, setAddType]     = useState('after')
  const [addVal, setAddVal]       = useState('')

  function addDay() {
    setError('')
    if (addType === 'surgery') {
      if (days.includes(0)) { setError('O dia da cirurgia já está no protocolo'); return }
      setDays(prev => [...new Set([...prev, 0])].sort((a, b) => a - b))
      return
    }
    const n = parseInt(addVal, 10)
    if (isNaN(n) || n <= 0) { setError('Informe um número de dias válido'); return }
    const val = addType === 'before' ? -n : n
    if (days.includes(val)) { setError('Este dia já está no protocolo'); return }
    setDays(prev => [...new Set([...prev, val])].sort((a, b) => a - b))
    setAddVal('')
  }

  async function handleSave() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    if (days.length === 0) { setError('Adicione pelo menos um marco de contato'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        name: name.trim(),
        description: description || null,
        color,
        is_default: isDefault,
        days,
      }
      if (isEdit) await api.protocols.update(proto.id, body)
      else        await api.protocols.create(body)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const preDays  = days.filter(d => d < 0)
  const postDays = days.filter(d => d > 0)
  const maxDay   = postDays.length ? Math.max(...postDays) : 0

  return (
    <Modal open onClose={onClose} title={isEdit ? `Editar — ${proto.name}` : 'Novo protocolo'} wide>
      <div className="space-y-5">
        {/* Nome + cor + padrão */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nome do protocolo *</label>
            <input className="input" value={name} onChange={e => { setName(e.target.value); setError('') }} placeholder="Ex: Padrão, + Atenção…" autoFocus />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={description} onChange={e => setDesc(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="label">Cor de identificação</label>
            <div className="flex items-center gap-2">
              <input type="color" className="w-10 h-10 rounded-lg border border-outline-variant cursor-pointer shrink-0" value={color} onChange={e => setColor(e.target.value)} />
              <input className="input" value={color} onChange={e => setColor(e.target.value)} pattern="^#[0-9a-fA-F]{6}$" />
            </div>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary" />
          <span className="text-body-md text-on-surface">Definir como protocolo padrão para novos pacientes</span>
        </label>
        <hr className="border-outline-variant" />

        {/* Dias pré-cirurgia */}
        <div>
          <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-2">
            Pré-cirurgia
          </p>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {preDays.length === 0
              ? <span className="text-body-md text-outline italic">Nenhum</span>
              : preDays.map(d => <DayChip key={d} day={d} onRemove={() => setDays(prev => prev.filter(x => x !== d))} />)
            }
          </div>
        </div>

        {/* Dia da cirurgia */}
        <div>
          <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-2">
            Dia da cirurgia
          </p>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {days.includes(0)
              ? <DayChip day={0} onRemove={() => setDays(prev => prev.filter(x => x !== 0))} />
              : <span className="text-body-md text-outline italic">Não incluído</span>
            }
          </div>
        </div>

        {/* Dias pós-cirurgia */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">
              Pós-cirurgia {maxDay > 0 && <span className="normal-case font-normal">(até {maxDay}d ≈ {Math.round(maxDay/30)}m)</span>}
            </p>
            {postDays.length > 0 && (
              <button type="button" onClick={() => setDays(prev => prev.filter(d => d <= 0))} className="text-label-sm text-error hover:underline">
                Limpar pós-cirurgia
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 min-h-[32px] mb-3">
            {postDays.length === 0
              ? <span className="text-body-md text-outline italic">Nenhum</span>
              : postDays.map(d => <DayChip key={d} day={d} onRemove={() => setDays(prev => prev.filter(x => x !== d))} />)
            }
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
            <p className="text-body-sm text-on-surface-variant">
              Monte o protocolo escolhendo manualmente cada marco do acompanhamento.
              Você pode combinar contatos antes da cirurgia, no dia da cirurgia e depois da cirurgia sem seguir intervalos fixos.
            </p>
          </div>
        </div>

        {/* Adicionar dia manual */}
        <div className="pt-1 border-t border-outline-variant">
          <p className="text-label-sm font-label-sm text-on-surface-variant mb-2">Adicionar marco manualmente</p>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex rounded-lg border border-outline-variant overflow-hidden">
              {[
                { v: 'before',  l: 'Antes' },
                { v: 'surgery', l: 'Cirurgia' },
                { v: 'after',   l: 'Após' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => { setAddType(opt.v); setError('') }}
                  className={`px-3 py-1.5 text-label-sm font-label-sm transition-colors ${addType === opt.v ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'}`}>
                  {opt.l}
                </button>
              ))}
            </div>
            {addType !== 'surgery' && (
              <div className="relative">
                <input type="number" min="1" max="365" className="input w-28 pr-8" placeholder="Dias"
                  value={addVal}
                  onChange={e => { setAddVal(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && addDay()} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-label-sm text-outline pointer-events-none">d</span>
              </div>
            )}
            <button type="button" onClick={addDay}
              className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-sm font-label-sm hover:opacity-90 transition-opacity flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
              Add
            </button>
          </div>
        </div>

        {/* Preview timeline */}
        {days.length > 0 && (
          <div className="bg-surface-container-low rounded-lg p-3 overflow-x-auto">
            <div className="flex items-center gap-0" style={{ minWidth: 'max-content' }}>
              {days.map((d, i) => (
                <div key={d} className="flex items-center">
                  {i > 0 && <div className="w-4 h-px bg-outline-variant" />}
                  <div className={`flex flex-col items-center px-2 py-1 rounded-lg border text-center min-w-[52px] ${
                    d < 0  ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
                           : d === 0 ? 'bg-primary/10 border-primary/30 text-primary'
                           : 'bg-secondary/10 border-secondary/30 text-secondary'
                  }`}>
                    <span className="text-label-sm font-semibold whitespace-nowrap">
                      {formatProtocolDayShort(d)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-label-sm text-error bg-error-container/20 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Spinner /> : isEdit ? 'Salvar alterações' : 'Criar protocolo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DayChip({ day, onRemove }) {
  const label = day < 0
    ? `${Math.abs(day)} ${Math.abs(day) === 1 ? 'dia' : 'dias'} antes da cirurgia`
    : day === 0 ? 'Dia da cirurgia'
    : `${day} ${day === 1 ? 'dia' : 'dias'} depois da cirurgia`

  const cls = day < 0
    ? 'bg-[#fff3e0] border-[#ffe0b2] text-[#ef6c00]'
    : day === 0 ? 'bg-primary/10 border-primary/30 text-primary'
    : 'bg-secondary/10 border-secondary/30 text-secondary'

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-label-sm font-label-sm ${cls}`}>
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:opacity-70 transition-opacity leading-none" title="Remover">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
        </button>
      )}
    </span>
  )
}

// ── Tab: Agentes ──────────────────────────────────────────────
function AgentsTab() {
  const [agents, setAgents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalType, setModalType]   = useState(null)
  const [selected, setSelected]     = useState(null)

  async function loadAgents() {
    setLoading(true)
    api.agents.list().then(d => setAgents(d ?? [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { loadAgents() }, [])

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-body-md text-on-surface-variant">
          {agents.length} agente{agents.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => { setSelected(null); setModalType('create') }}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg text-label-md font-label-md hover:opacity-90 transition-opacity ambient-shadow-lvl1 flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Novo agente
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-surface-container-low rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          {agents.map(a => (
            <li key={a.id} className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-4 flex items-center gap-3">
              <Avatar name={a.name} src={a.avatar_url} size="md" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-label-md font-label-md text-on-surface font-semibold">{a.name}</p>
                  <span className={`px-2 py-0.5 rounded-full text-label-sm font-label-sm border ${
                    a.role === 'admin'
                      ? 'bg-primary/10 border-primary/20 text-primary'
                      : 'bg-surface-container-high border-outline-variant text-on-surface-variant'
                  }`}>
                    {a.role === 'admin' ? 'Admin' : 'Agente'}
                  </span>
                  {!a.is_active && (
                    <span className="px-2 py-0.5 rounded-full text-label-sm font-label-sm bg-error-container border border-error/20 text-error">
                      Inativo
                    </span>
                  )}
                </div>
                <p className="text-body-md text-outline truncate">{a.email}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { setSelected(a); setModalType('resetpwd') }}
                  className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                  title="Redefinir senha"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>key</span>
                </button>
                <button
                  onClick={() => { setSelected(a); setModalType('edit') }}
                  className="p-1.5 text-outline hover:text-primary rounded hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalType === 'create' && <AgentModal onClose={() => setModalType(null)} onSaved={loadAgents} />}
      {modalType === 'edit' && selected && <AgentModal agent={selected} onClose={() => setModalType(null)} onSaved={loadAgents} />}
      {modalType === 'resetpwd' && selected && <ResetPasswordModal agent={selected} onClose={() => setModalType(null)} />}
    </>
  )
}

function AgentModal({ agent, onClose, onSaved }) {
  const isEdit = !!agent
  const currentAgent = useAuthStore((state) => state.agent)
  const updateAgent = useAuthStore((state) => state.updateAgent)
  const [form, setForm] = useState({
    name:             agent?.name ?? '',
    email:            agent?.email ?? '',
    password:         '',
    role:             agent?.role ?? 'agent',
    is_active:        agent?.is_active ?? 1,
    avatar_url:       agent?.avatar_url ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError]   = useState('')

  function set(field) { return e => { setForm(f => ({ ...f, [field]: e.target.value })); setError('') } }

  async function handleAvatarUpload(file) {
    if (!file || !agent?.id) return
    setUploadingAvatar(true)
    setError('')
    try {
      const data = await api.agents.uploadAvatar(agent.id, file)
      const avatarUrl = data.avatar_url || ''
      setForm((current) => ({ ...current, avatar_url: avatarUrl }))
      onSaved()
      if (currentAgent?.id === agent.id) updateAgent({ avatar_url: avatarUrl })
    } catch (err) {
      setError(err.message || 'Nao foi possivel enviar o avatar.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleAvatarRemove() {
    if (!agent?.id) return
    setUploadingAvatar(true)
    setError('')
    try {
      await api.agents.removeAvatar(agent.id)
      setForm((current) => ({ ...current, avatar_url: '' }))
      onSaved()
      if (currentAgent?.id === agent.id) updateAgent({ avatar_url: null })
    } catch (err) {
      setError(err.message || 'Nao foi possivel remover o avatar.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) {
        const payload = { name: form.name, email: form.email, role: form.role, is_active: Number(form.is_active) }
        await api.agents.update(agent.id, payload)
      } else {
        await api.agents.create(form)
      }
      onSaved(); onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar agente' : 'Novo agente'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isEdit ? (
          <div className="rounded-[22px] border border-outline-variant bg-surface-container p-4">
            <div className="flex items-start gap-4">
              <Avatar name={form.name} src={form.avatar_url} size="xl" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface">Avatar do agente</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Use este fluxo como referencia para futuros assets visuais do sistema.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <label className="btn-ghost cursor-pointer">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                      className="hidden"
                      onChange={(event) => handleAvatarUpload(event.target.files?.[0])}
                    />
                    {uploadingAvatar ? 'Enviando...' : 'Fazer upload'}
                  </label>
                  {form.avatar_url && (
                    <button type="button" onClick={handleAvatarRemove} className="btn-ghost" disabled={uploadingAvatar}>
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[18px] border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Salve o agente primeiro. O avatar fica disponivel na edicao, usando o mesmo fluxo organizado de storage.
          </div>
        )}
        <div><label className="label">Nome</label><input className="input" value={form.name} onChange={set('name')} required disabled={saving} /></div>
        <div><label className="label">E-mail</label><input type="email" className="input" value={form.email} onChange={set('email')} required disabled={saving} /></div>
        {!isEdit && (
          <div>
            <label className="label">Senha</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres"
              value={form.password} onChange={set('password')} required minLength={8} disabled={saving} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Perfil</label>
            <select className="input" value={form.role} onChange={set('role')} disabled={saving}>
              <option value="agent">Agente</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {isEdit && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: Number(e.target.value) }))} disabled={saving}>
                <option value={1}>Ativo</option>
                <option value={0}>Inativo</option>
              </select>
            </div>
          )}
        </div>
        {error && <p className="text-label-sm text-error bg-error-container/30 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? <Spinner /> : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ agent, onClose }) {
  const [pwd, setPwd]       = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (pwd.length < 8) { setError('Mínimo 8 caracteres'); return }
    setSaving(true)
    try {
      await api.agents.resetPassword(agent.id, { newPassword: pwd })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Redefinir senha — ${agent.name}`}>
      {done ? (
        <div className="flex flex-col items-center py-4 gap-3">
          <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: '24px' }}>check_circle</span>
          </div>
          <p className="text-body-md text-on-surface-variant text-center">Senha redefinida com sucesso!</p>
          <button onClick={onClose} className="btn-primary">Fechar</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nova senha</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres"
              value={pwd} onChange={e => { setPwd(e.target.value); setError('') }}
              minLength={8} required disabled={saving} autoFocus />
          </div>
          {error && <p className="text-label-sm text-error">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? <Spinner /> : 'Redefinir'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Tab: Configurações ────────────────────────────────────────
function SettingsTab() {
  const { setSettings } = useSettingsStore()
  const [form, setFormState] = useState({ clinic_name: '', primary_color: '#6366f1', logo_url: '', timezone: 'America/Fortaleza' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.settings.get()
      .then(data => { if (data) setFormState(f => ({ ...f, ...data })) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set(field) { return e => { setFormState(f => ({ ...f, [field]: e.target.value })); setSuccess(false); setError('') } }
  function selectTheme(theme) {
    setFormState(f => ({ ...f, primary_color: theme.primary }))
    setSuccess(false)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.settings.update(form)
      setSettings(form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-48 bg-surface-container-low rounded-xl animate-pulse" />

  const activeTheme = VISUAL_THEMES.find(theme => theme.primary.toLowerCase() === String(form.primary_color).toLowerCase())

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6 space-y-5">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">Configurações gerais</h2>
        <div><label className="label">Nome da clínica</label><input className="input" value={form.clinic_name} onChange={set('clinic_name')} required /></div>
        <div>
          <label className="label">Tema visual</label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {VISUAL_THEMES.map(theme => {
              const isSelected = theme.primary.toLowerCase() === String(form.primary_color).toLowerCase()
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => selectTheme(theme)}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-outline-variant bg-surface hover:border-primary/40 hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-label-md font-label-md text-on-surface">{theme.name}</p>
                      <p className="text-body-sm text-on-surface-variant mt-1">{theme.description}</p>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: '20px' }}>
                        check_circle
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    {theme.swatches.map(color => (
                      <span
                        key={color}
                        className="w-9 h-9 rounded-full border border-black/5 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">Tema selecionado</p>
            <div className="flex items-center gap-3 mt-2">
              <span
                className="w-10 h-10 rounded-full border border-black/5 shadow-sm shrink-0"
                style={{ backgroundColor: form.primary_color }}
              />
              <div>
                <p className="text-body-md text-on-surface font-medium">
                  {activeTheme?.name ?? 'Tema personalizado legado'}
                </p>
                <p className="text-label-sm text-on-surface-variant">
                  Cor principal aplicada na interface: {form.primary_color}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div><label className="label">URL do logo</label><input className="input" placeholder="https://…" value={form.logo_url} onChange={set('logo_url')} /></div>
        <div>
          <label className="label">Fuso horário</label>
          <select className="input" value={form.timezone} onChange={set('timezone')}>
            <option value="America/Fortaleza">America/Fortaleza (BRT -3)</option>
            <option value="America/Sao_Paulo">America/Sao_Paulo (BRT -3 / BRST -2)</option>
            <option value="America/Manaus">America/Manaus (AMT -4)</option>
            <option value="America/Belem">America/Belem (BRT -3)</option>
          </select>
        </div>
        {error   && <p className="text-label-sm text-error bg-error-container/30 px-3 py-2 rounded-lg">{error}</p>}
        {success && (
          <p className="text-label-sm text-secondary bg-secondary/10 px-3 py-2 rounded-lg flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
            Configurações salvas!
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner /> : 'Salvar configurações'}
        </button>
      </div>
    </form>
  )
}

// ── Shared ────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, wide }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: .96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .96, y: 16 }}
            transition={{ duration: .2, ease: [.16, 1, .3, 1] }}
            className={`fixed inset-x-4 top-[8vh] z-50 mx-auto bg-surface rounded-2xl shadow-modal overflow-hidden border border-outline-variant ${wide ? 'max-w-2xl' : 'max-w-md'}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-headline-sm font-headline-sm text-on-surface">{title}</h3>
              <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
}
