import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Phone, Mail, Calendar, User, FileText,
  Plus, ChevronDown, ChevronUp, Pencil, Trash2,
  PhoneCall, MessageCircle, AtSign, HandshakeIcon, X, Save
} from 'lucide-react'
import { api } from '@/services/api'
import { useAuthStore } from '@/store'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CONTACT_TYPES = [
  { value: 'call',      label: 'Ligação',   Icon: PhoneCall },
  { value: 'whatsapp',  label: 'WhatsApp',  Icon: MessageCircle },
  { value: 'email',     label: 'E-mail',    Icon: AtSign },
  { value: 'in_person', label: 'Presencial', Icon: HandshakeIcon },
]

const OUTCOMES = [
  { value: 'reached',            label: 'Contactado' },
  { value: 'no_answer',          label: 'Sem resposta' },
  { value: 'callback_scheduled', label: 'Retorno agendado' },
]

const urgencyInfo = {
  overdue: { label: 'Atrasado',    cls: 'badge-overdue' },
  due:     { label: 'Vence hoje',  cls: 'badge-due' },
  soon:    { label: 'Em breve',    cls: 'badge-soon' },
  ok:      { label: 'Em dia',      cls: 'badge-ok' },
  none:    { label: '—',           cls: 'badge-paused' },
}

const statusLabel = {
  active:     'Ativo',
  paused:     'Pausado',
  discharged: 'Alta',
}

export default function PatientDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { isAdmin, agent } = useAuthStore()

  const [patient, setPatient]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showLog, setShowLog]     = useState(true)
  const [addOpen, setAddOpen]     = useState(false)
  const [editOpen, setEditOpen]   = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const [saving, setSaving]       = useState(false)

  const [logForm, setLogForm] = useState({
    contact_date:     new Date().toISOString().split('T')[0],
    contact_type:     'call',
    outcome:          'reached',
    notes:            '',
    next_followup_date: '',
  })

  const [editForm, setEditForm] = useState({})

  async function load() {
    setLoading(true)
    try {
      const data = await api.patients.get(id)
      setPatient(data)
      setEditForm({
        name:              data.name,
        phone:             data.phone || '',
        email:             data.email || '',
        procedure:         data.procedure,
        surgery_date:      data.surgery_date,
        protocol_days:     data.protocol_days,
        status:            data.status,
        notes:             data.notes || '',
        assigned_agent_id: data.assigned_agent_id || '',
      })
    } catch {
      navigate('/patients', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleAddLog(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.followups.create({ ...logForm, patient_id: id })
      setAddOpen(false)
      setLogForm({
        contact_date: new Date().toISOString().split('T')[0],
        contact_type: 'call', outcome: 'reached', notes: '', next_followup_date: '',
      })
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
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-slate-100 rounded-xl" />
      <div className="card h-48 bg-slate-50" />
      <div className="card h-64 bg-slate-50" />
    </div>
  )

  if (!patient) return null

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link to="/patients" className="btn-ghost !px-2 !py-2">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{patient.name}</h1>
          <p className="text-xs text-slate-400">{patient.procedure}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className={urgencyInfo[patient.followup_urgency]?.cls}>
            {urgencyInfo[patient.followup_urgency]?.label}
          </span>
          <span className="badge bg-slate-100 text-slate-600">
            {statusLabel[patient.status]}
          </span>
        </div>
      </div>

      {/* Info card */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-600">Informações</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditOpen(true)} className="btn-ghost !px-2 !py-1.5 text-xs gap-1.5">
              <Pencil size={13} /> Editar
            </button>
            {isAdmin() && (
              <button onClick={() => setDelConfirm(true)} className="btn !px-2 !py-1.5 text-xs gap-1.5 text-red-600 hover:bg-red-50">
                <Trash2 size={13} /> Excluir
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow icon={Calendar} label="Cirurgia" value={
            patient.surgery_date
              ? format(parseISO(patient.surgery_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
              : '—'
          } />
          <InfoRow icon={User} label="Agente" value={patient.agent_name || 'Não atribuído'} />
          {patient.phone && <InfoRow icon={Phone} label="Telefone" value={patient.phone} />}
          {patient.email && <InfoRow icon={Mail}  label="E-mail"   value={patient.email} />}
          <InfoRow icon={FileText} label="Protocolo (dias)" value={patient.protocol_days} />
          {patient.notes && (
            <div className="sm:col-span-2">
              <InfoRow icon={FileText} label="Observações" value={patient.notes} />
            </div>
          )}
        </div>
      </div>

      {/* Follow-up logs */}
      <div className="card !p-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <button
            onClick={() => setShowLog(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            Histórico de contatos
            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
              {patient.followup_logs?.length ?? 0}
            </span>
            {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-primary !py-1.5 !px-3 text-xs">
            <Plus size={14} /> Registrar contato
          </button>
        </div>

        <AnimatePresence>
          {showLog && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: .2 }}
              className="overflow-hidden"
            >
              {!patient.followup_logs?.length ? (
                <div className="flex flex-col items-center py-10 text-slate-400">
                  <p className="text-sm">Nenhum contato registrado ainda</p>
                </div>
              ) : (
                <ul className="divide-y divide-surface-border/50 px-5">
                  {patient.followup_logs.map(log => (
                    <LogItem key={log.id} log={log} />
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal: Registrar contato */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Registrar contato">
        <form onSubmit={handleAddLog} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data do contato</label>
              <input type="date" className="input"
                value={logForm.contact_date}
                onChange={e => setLogForm(f => ({ ...f, contact_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Próximo follow-up</label>
              <input type="date" className="input"
                value={logForm.next_followup_date}
                onChange={e => setLogForm(f => ({ ...f, next_followup_date: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="label">Tipo de contato</label>
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_TYPES.map(({ value, label, Icon }) => (
                <button
                  key={value} type="button"
                  onClick={() => setLogForm(f => ({ ...f, contact_type: value }))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                    ${logForm.contact_type === value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-surface-border text-slate-600 hover:bg-slate-50'}`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Resultado</label>
            <select className="input"
              value={logForm.outcome}
              onChange={e => setLogForm(f => ({ ...f, outcome: e.target.value }))}
            >
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={3}
              placeholder="Anotações sobre o contato…"
              value={logForm.notes}
              onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setAddOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? <Spinner /> : <><Save size={14} /> Salvar</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Editar paciente */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar paciente">
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
              <input type="email" className="input" value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Procedimento</label>
              <input className="input" value={editForm.procedure}
                onChange={e => setEditForm(f => ({ ...f, procedure: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Data da cirurgia</label>
              <input type="date" className="input" value={editForm.surgery_date}
                onChange={e => setEditForm(f => ({ ...f, surgery_date: e.target.value }))} required />
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
            <div className="sm:col-span-2">
              <label className="label">Protocolo de dias</label>
              <input className="input" value={editForm.protocol_days}
                placeholder="ex: 7,15,30,60,90"
                onChange={e => setEditForm(f => ({ ...f, protocol_days: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Observações</label>
              <textarea className="input resize-none" rows={2} value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setEditOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? <Spinner /> : <><Save size={14} /> Salvar</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Confirmação de exclusão */}
      <Modal open={delConfirm} onClose={() => setDelConfirm(false)} title="Excluir paciente">
        <p className="text-sm text-slate-600 mb-5">
          Tem certeza que deseja excluir <strong>{patient.name}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setDelConfirm(false)} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={handleDelete} className="btn-danger flex-1" disabled={saving}>
            {saving ? <Spinner /> : <><Trash2 size={14} /> Excluir</>}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[11px] text-slate-400 uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-slate-700 text-sm">{value}</p>
      </div>
    </div>
  )
}

function LogItem({ log }) {
  const typeIcons = {
    call:      PhoneCall,
    whatsapp:  MessageCircle,
    email:     AtSign,
    in_person: HandshakeIcon,
  }
  const outcomeColors = {
    reached:            'text-emerald-600',
    no_answer:          'text-slate-400',
    callback_scheduled: 'text-amber-600',
  }
  const outcomeLabels = {
    reached:            'Contactado',
    no_answer:          'Sem resposta',
    callback_scheduled: 'Retorno agendado',
  }
  const Icon = typeIcons[log.contact_type] ?? PhoneCall

  return (
    <li className="py-3.5 flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${outcomeColors[log.outcome]}`}>
            {outcomeLabels[log.outcome]}
          </span>
          <span className="text-xs text-slate-400">
            {log.contact_date ? format(parseISO(log.contact_date), "dd 'de' MMMM", { locale: ptBR }) : '—'}
          </span>
          {log.agent_name && <span className="text-xs text-slate-400">· {log.agent_name}</span>}
        </div>
        {log.notes && <p className="text-sm text-slate-600 mt-1">{log.notes}</p>}
        {log.next_followup_date && (
          <p className="text-xs text-primary-600 mt-1">
            Próximo: {format(parseISO(log.next_followup_date), "dd/MM/yyyy")}
          </p>
        )}
      </div>
    </li>
  )
}

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
            className="fixed inset-x-4 top-[10vh] z-50 mx-auto max-w-lg bg-white rounded-2xl shadow-modal overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="font-semibold text-slate-800">{title}</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 max-h-[75vh] overflow-y-auto">
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
