import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/services/api'

const CATEGORIES = [
  { value: 'send',    label: 'Enviar',   icon: 'outgoing_mail', empty: 'Nenhum documento para enviar cadastrado ainda.' },
  { value: 'request', label: 'Solicitar', icon: 'contact_page',  empty: 'Nenhum documento para solicitar cadastrado ainda.' },
]

export default function DocumentProtocolTab() {
  const [subTab, setSubTab] = useState('send')
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalDocument, setModalDocument] = useState(null)
  const [delTarget, setDelTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [delError, setDelError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await api.documentTemplates.list()
      setDocuments(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => {})
  }, [])

  const documentsBySubTab = useMemo(
    () => documents.filter((doc) => doc.category === subTab),
    [documents, subTab]
  )

  const activeCategory = CATEGORIES.find((c) => c.value === subTab)

  async function handleDelete(document_) {
    setDeleting(true)
    setDelError('')
    try {
      await api.documentTemplates.delete(document_.id)
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
          <div key={item} className="h-20 animate-pulse rounded-xl bg-surface-container-low" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-low p-1 w-fit">
          {CATEGORIES.map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => setSubTab(value)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-label-md font-label-md transition-all ${
                subTab === value
                  ? 'bg-surface text-on-surface ambient-shadow-lvl1'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface/50'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setModalDocument({ category: subTab })}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary transition-opacity hover:opacity-90 ambient-shadow-lvl1"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Novo documento
        </button>
      </div>

      {documentsBySubTab.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface p-10 text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>{activeCategory.icon}</span>
          <p className="text-label-md">{activeCategory.empty}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documentsBySubTab.map((doc) => (
            <div key={doc.id} className="flex items-start justify-between gap-4 rounded-xl border border-outline-variant bg-surface p-4 ambient-shadow-lvl1">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-label-md font-semibold text-on-surface">{doc.name}</h3>
                  {doc.patient_count > 0 && (
                    <span className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5 text-label-sm text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>group</span>
                      {doc.patient_count} paciente{doc.patient_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {doc.description && (
                  <p className="mt-1 text-body-md text-on-surface-variant">{doc.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => setModalDocument(doc)}
                  className="rounded p-1.5 text-outline transition-colors hover:bg-surface-container-high hover:text-primary"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                </button>
                <button
                  onClick={() => { setDelTarget(doc); setDelError('') }}
                  className="rounded p-1.5 text-outline transition-colors hover:bg-error-container/20 hover:text-error"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalDocument !== null && (
        <DocumentTemplateModal
          document={modalDocument.id ? modalDocument : null}
          defaultCategory={modalDocument.category ?? subTab}
          onClose={() => setModalDocument(null)}
          onSaved={load}
        />
      )}

      {delTarget && (
        <Modal open onClose={() => setDelTarget(null)} title="Excluir documento">
          <p className="mb-4 text-body-md text-on-surface-variant">
            Tem certeza que deseja excluir <strong className="text-on-surface">{delTarget.name}</strong>?
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

function DocumentTemplateModal({ document: doc, defaultCategory, onClose, onSaved }) {
  const isEdit = Boolean(doc)
  const [name, setName] = useState(doc?.name ?? '')
  const [category, setCategory] = useState(doc?.category ?? defaultCategory)
  const [description, setDescription] = useState(doc?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = { name, category, description }
      if (isEdit) await api.documentTemplates.update(doc.id, payload)
      else await api.documentTemplates.create(payload)

      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Editar documento — ${doc.name}` : 'Novo documento'}>
      <div className="space-y-4">
        <div>
          <label className="label">Categoria</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-label-md font-label-md transition-all ${
                  category === option.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{option.icon}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Nome do documento</label>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: RG, Termo de consentimento"
          />
        </div>

        <div>
          <label className="label">Descrição (opcional)</label>
          <textarea
            className="input min-h-[100px] resize-y"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Detalhes sobre o documento, se necessário"
          />
        </div>

        {error && <p className="rounded-lg bg-error-container/20 px-3 py-2 text-label-sm text-error">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Spinner /> : isEdit ? 'Salvar alterações' : 'Criar documento'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Modal({ open, onClose, title, children }) {
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-[calc(100vw-1rem)] max-w-[36rem] overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-modal"
            >
              <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
                <h3 className="text-headline-sm font-headline-sm text-on-surface">{title}</h3>
                <button onClick={onClose} className="rounded-lg p-1 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface">
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
}
