-- Frente A (roadmap de escalabilidade, Status.md 13.3): aba Historico.
-- Registra o autor do cadastro do paciente e cria os indices que servem o
-- feed global de atividade (GET /api/activity), ordenado por created_at DESC.

-- Autor do cadastro do paciente. Linhas pre-existentes ficam com NULL
-- (feed mostra "cadastrado" sem autor so pros pacientes anteriores a esta migration).
ALTER TABLE patients ADD COLUMN created_by TEXT REFERENCES agents(id) ON DELETE SET NULL;

-- Indices para o feed de historico: o indice existente de followups e composto
-- (patient_id, contact_date) e nao serve um ORDER BY created_at global; patients
-- nao tinha nenhum indice por created_at.
CREATE INDEX IF NOT EXISTS idx_followups_created ON followup_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_created  ON patients(created_at DESC);
