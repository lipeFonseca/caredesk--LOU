import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Settings, Send, Plus, Pencil, KeyRound,
  Save, X, RefreshCw, Check, AlertCircle
} from 'lucide-react'
import { api } from '@/services/api'
import { useSettingsStore } from '@/store'

const TABS = [
  { id: 'agents',   label: 'Agentes',       icon: Users },
  { id: 'settings', label: 'Configurações',  icon: Settings },
  { id: 'telegram', label: 'Telegram',       icon: Send },
]

export default function Admin() {
  const [tab, setTab] = useState('agents')

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Administração</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gerencie agentes e configurações do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === id
                ? 'bg-white text-slate-800 shadow-card'
                : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Icon size={15} /> {label}
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
          {tab === 'agents'   && <AgentsTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'telegram' && <TelegramTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Tab: Agentes ──────────────────────────────────────────────────
function AgentsTab() {
  const [agents, setAgents]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [modalType, setModalType] = useState(null) // 'create' | 'edit' | 'resetpwd'
  const [selected, setSelected] = useState(null)

  async function loadAgents() {
    setLoading(true)
    api.agents.list().then(d => setAgents(d ?? [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadAgents() }, [])

  function openEdit(agent) {
    setSelected(agent)
    setModalType('edit')
  }
  function openReset(agent) {
    setSelected(agent)
    setModalType('resetpwd')
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-500">{agents.length} agente{agents.length !== 1 ? 's' : ''}</p>
        <button onClick={() => { setSelected(null); setModalType('create') }} className="btn-primary">
          <Plus size={16} /> Novo agente
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card h-16 animate-pulse bg-slate-50" />)}
        </div>
      ) : (
        <ul className="space-y-2">
          {agents.map(a => (
            <li key={a.id} className="card flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-primary-700 text-sm font-semibold">{a.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-slate-700">{a.name}</p>
                  <span className={`badge ${a.role === 'admin' ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>
                    {a.role === 'admin' ? 'Admin' : 'Agente'}
                  </span>
                  {!a.is_active && <span className="badge bg-red-50 text-red-600">Inativo</span>}
                </div>
                <p className="text-xs text-slate-400 truncate">{a.email}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => openReset(a)} className="btn-ghost !px-2 !py-1.5 text-xs" title="Redefinir senha">
                  <KeyRound size={13} />
                </button>
                <button onClick={() => openEdit(a)} className="btn-ghost !px-2 !py-1.5 text-xs">
                  <Pencil size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Modals */}
      {modalType === 'create' && (
        <AgentModal
          onClose={() => setModalType(null)}
          onSaved={loadAgents}
        />
      )}
      {modalType === 'edit' && selected && (
        <AgentModal
          agent={selected}
          onClose={() => setModalType(null)}
          onSaved={loadAgents}
        />
      )}
      {modalType === 'resetpwd' && selected && (
        <ResetPasswordModal
          agent={selected}
          onClose={() => setModalType(null)}
        />
      )}
    </>
  )
}

function AgentModal({ agent, onClose, onSaved }) {
  const isEdit = !!agent
  const [form, setForm] = useState({
    name:             agent?.name ?? '',
    email:            agent?.email ?? '',
    password:         '',
    role:             agent?.role ?? 'agent',
    telegram_chat_id: agent?.telegram_chat_id ?? '',
    is_active:        agent?.is_active ?? 1,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field) {
    return e => { setForm(f => ({ ...f, [field]: e.target.value })); setError('') }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) {
        const payload = { name: form.name, email: form.email, role: form.role, is_active: Number(form.is_active) }
        if (form.telegram_chat_id) payload.telegram_chat_id = form.telegram_chat_id
        await api.agents.update(agent.id, payload)
      } else {
        await api.agents.create(form)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar agente' : 'Novo agente'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={form.name} onChange={set('name')} required disabled={saving} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input type="email" className="input" value={form.email} onChange={set('email')} required disabled={saving} />
        </div>
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
        <div>
          <label className="label">Telegram Chat ID</label>
          <input className="input" placeholder="Opcional" value={form.telegram_chat_id} onChange={set('telegram_chat_id')} disabled={saving} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? <Spinner /> : <><Save size={14} /> Salvar</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ agent, onClose }) {
  const [pwd, setPwd]   = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

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
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check size={22} className="text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600 text-center">Senha redefinida com sucesso!</p>
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? <Spinner /> : <><KeyRound size={14} /> Redefinir</>}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Tab: Configurações ────────────────────────────────────────────
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

  function set(field) {
    return e => { setFormState(f => ({ ...f, [field]: e.target.value })); setSuccess(false); setError('') }
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

  if (loading) return <div className="card h-48 animate-pulse bg-slate-50" />

  return (
    <form onSubmit={handleSubmit}>
      <div className="card space-y-5">
        <h2 className="text-sm font-semibold text-slate-700">Configurações gerais</h2>

        <div>
          <label className="label">Nome da clínica</label>
          <input className="input" value={form.clinic_name} onChange={set('clinic_name')} required />
        </div>

        <div>
          <label className="label">Cor primária</label>
          <div className="flex items-center gap-3">
            <input type="color" className="w-10 h-10 rounded-xl border border-surface-border cursor-pointer"
              value={form.primary_color} onChange={set('primary_color')} />
            <input className="input" value={form.primary_color} onChange={set('primary_color')}
              pattern="^#[0-9a-fA-F]{6}$" placeholder="#6366f1" />
          </div>
        </div>

        <div>
          <label className="label">URL do logo</label>
          <input className="input" placeholder="https://…" value={form.logo_url} onChange={set('logo_url')} />
        </div>

        <div>
          <label className="label">Fuso horário</label>
          <select className="input" value={form.timezone} onChange={set('timezone')}>
            <option value="America/Fortaleza">America/Fortaleza (BRT -3)</option>
            <option value="America/Sao_Paulo">America/Sao_Paulo (BRT -3 / BRST -2)</option>
            <option value="America/Manaus">America/Manaus (AMT -4)</option>
            <option value="America/Belem">America/Belem (BRT -3)</option>
          </select>
        </div>

        {error   && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl">
            <Check size={15} /> Configurações salvas!
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner /> : <><Save size={15} /> Salvar configurações</>}
        </button>
      </div>
    </form>
  )
}

// ── Tab: Telegram ─────────────────────────────────────────────────
function TelegramTab() {
  const [form, setFormState] = useState({
    bot_token: '', default_chat_id: '', notify_group: false, group_chat_id: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.settings.getTelegram()
      .then(data => {
        if (data) setFormState(f => ({
          ...f,
          ...data,
          notify_group: !!data.notify_group,
          bot_token: '', // não preencher o token mascarado
        }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set(field) {
    return e => { setFormState(f => ({ ...f, [field]: e.target.value })); setSuccess(false); setError('') }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.settings.updateTelegram(form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card h-48 animate-pulse bg-slate-50" />

  return (
    <form onSubmit={handleSubmit}>
      <div className="card space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Integração com Telegram</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure o bot para receber alertas de follow-up diretamente no Telegram.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={13} /> Como configurar</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
            <li>Fale com @BotFather no Telegram e crie um bot</li>
            <li>Copie o token gerado e cole abaixo</li>
            <li>Envie uma mensagem para o seu bot</li>
            <li>Acesse: api.telegram.org/bot&lt;TOKEN&gt;/getUpdates para obter seu chat_id</li>
          </ol>
        </div>

        <div>
          <label className="label">Token do bot</label>
          <input className="input" placeholder="123456:ABC-DEF1234…"
            value={form.bot_token} onChange={set('bot_token')} />
          <p className="text-xs text-slate-400 mt-1">Deixe em branco para manter o token atual</p>
        </div>

        <div>
          <label className="label">Chat ID padrão</label>
          <input className="input" placeholder="Seu chat_id pessoal"
            value={form.default_chat_id} onChange={set('default_chat_id')} />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="notify_group"
            checked={form.notify_group}
            onChange={e => setFormState(f => ({ ...f, notify_group: e.target.checked }))}
            className="w-4 h-4 rounded border-surface-border text-primary-600"
          />
          <label htmlFor="notify_group" className="text-sm text-slate-600 cursor-pointer">
            Notificar também um grupo
          </label>
        </div>

        {form.notify_group && (
          <div>
            <label className="label">Chat ID do grupo</label>
            <input className="input" placeholder="-100xxxxxxxxxx"
              value={form.group_chat_id} onChange={set('group_chat_id')} />
          </div>
        )}

        {error   && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl">
            <Check size={15} /> Configuração do Telegram salva!
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Spinner /> : <><Save size={15} /> Salvar</>}
        </button>
      </div>
    </form>
  )
}

// ── Shared components ─────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
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
            transition={{ duration: .2, ease: [.16,1,.3,1] }}
            className="fixed inset-x-4 top-[15vh] z-50 mx-auto max-w-md bg-white rounded-2xl shadow-modal overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="font-semibold text-slate-800">{title}</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}
