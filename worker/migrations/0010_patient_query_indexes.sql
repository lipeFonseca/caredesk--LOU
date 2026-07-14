-- Indices preventivos para as queries mais pesadas da listagem de pacientes,
-- antes que o volume de dados torne isso um problema real:
--   - surgery_date: usado em WHERE (from/to) e ORDER BY na listagem principal
--   - protocol_id: usado no LEFT JOIN com contact_protocols em toda listagem
--   - followup_logs(patient_id, contact_date): otimiza a subquery de
--     "ultimo contato" (ORDER BY contact_date DESC LIMIT 1) que roda por paciente
CREATE INDEX IF NOT EXISTS idx_patients_surgery_date ON patients(surgery_date);
CREATE INDEX IF NOT EXISTS idx_patients_protocol ON patients(protocol_id);
CREATE INDEX IF NOT EXISTS idx_followups_patient_date ON followup_logs(patient_id, contact_date DESC);
