import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useAuthStore } from '@/store'

const CATEGORY_LABELS = {
  send: 'Documentos a enviar',
  request: 'Documentos a solicitar',
}

export default function PatientDocumentsSection({ patientId }) {
  const { isAdmin } = useAuthStore()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.patients.listDocuments(patientId)
      .then((data) => setDocuments(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [patientId])

  useEffect(() => { load() }, [load])

  async function toggleAssigned(doc) {
    setPendingId(doc.document_template_id)
    setError('')
    try {
      if (doc.assigned) {
        await api.patients.unassignDocument(patientId, doc.document_template_id)
      } else {
        await api.patients.assignDocument(patientId, doc.document_template_id)
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingId('')
    }
  }

  async function toggleStatus(doc) {
    setPendingId(doc.document_template_id)
    setError('')
    try {
      const nextStatus = doc.status === 'done' ? 'pending' : 'done'
      await api.patients.updateDocumentStatus(patientId, doc.document_template_id, nextStatus)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingId('')
    }
  }

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
        <div className="h-6 w-40 bg-surface-container-high rounded animate-pulse mb-6" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-surface-container-low animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const grouped = {
    send: documents.filter((d) => d.category === 'send'),
    request: documents.filter((d) => d.category === 'request'),
  }

  return (
    <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
      <h2 className="text-headline-sm font-headline-sm text-on-surface mb-6 pb-4 border-b border-outline-variant flex items-center gap-2">
        <span className="material-symbols-outlined text-outline">description</span>
        Documentos
      </h2>

      {error && (
        <p className="mb-4 rounded-lg bg-error-container/20 px-3 py-2 text-label-sm text-error">{error}</p>
      )}

      <div className="space-y-6">
        {['send', 'request'].map((category) => (
          <div key={category}>
            <p className="text-label-sm font-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">
              {CATEGORY_LABELS[category]}
            </p>
            {grouped[category].length === 0 ? (
              <p className="text-body-md text-outline">Nenhum documento configurado nesta categoria.</p>
            ) : (
              <div className="space-y-2">
                {grouped[category].map((doc) => (
                  <DocumentRow
                    key={doc.document_template_id}
                    doc={doc}
                    disabled={pendingId === doc.document_template_id}
                    onToggleAssigned={() => toggleAssigned(doc)}
                    onToggleStatus={() => toggleStatus(doc)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdmin() && (
        <p className="mt-4 text-[11px] text-outline">
          Gerencie o catálogo em Administração → Protocolo de Documentos.
        </p>
      )}
    </div>
  )
}

function DocumentRow({ doc, disabled, onToggleAssigned, onToggleStatus }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5">
      <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          checked={doc.assigned}
          disabled={disabled}
          onChange={onToggleAssigned}
          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-body-md text-on-surface truncate">{doc.name}</span>
          {doc.description && (
            <span className="block text-[11px] text-on-surface-variant truncate">{doc.description}</span>
          )}
        </span>
      </label>

      {doc.assigned && (
        <button
          type="button"
          onClick={onToggleStatus}
          disabled={disabled}
          className={`shrink-0 px-2.5 py-1 rounded-full text-label-sm font-label-sm transition-colors disabled:opacity-50 ${
            doc.status === 'done'
              ? 'bg-secondary-container/20 text-on-secondary-container hover:bg-secondary-container/30'
              : 'bg-[#fff8e1] text-[#f57f17] hover:bg-[#ffecb3]'
          }`}
        >
          {doc.status === 'done' ? 'Concluído' : 'Pendente'}
        </button>
      )}
    </div>
  )
}
