-- Remove coluna legada patients.protocol_days: era usada apenas como ultimo
-- fallback em resolvePatientProtocol antes da introducao de protocol_id/
-- contact_protocols. Verificado em producao (2026-07-14): 0 de N pacientes
-- dependem dela (todos tem protocol_id vinculado ou caem no protocolo padrao/
-- configuracao global antes de chegar no fallback legado).
ALTER TABLE patients DROP COLUMN protocol_days;
