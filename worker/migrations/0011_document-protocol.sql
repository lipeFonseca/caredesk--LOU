-- Catálogo de documentos configurado pelo admin (enviar ao paciente / solicitar do paciente)
CREATE TABLE IF NOT EXISTS document_templates (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('send', 'request')),
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documentos do catálogo atribuídos a um paciente + status de acompanhamento
CREATE TABLE IF NOT EXISTS patient_documents (
  id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id            TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  document_template_id  TEXT NOT NULL REFERENCES document_templates(id) ON DELETE RESTRICT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(patient_id, document_template_id)
);

CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient   ON patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_template  ON patient_documents(document_template_id);
