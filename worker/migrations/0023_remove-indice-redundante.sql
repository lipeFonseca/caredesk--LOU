-- Remove indice redundante em followup_logs.
--
-- `idx_followups_patient (patient_id)` e PREFIXO EXATO de
-- `idx_followups_patient_date (patient_id, contact_date DESC)`. Toda consulta
-- que o primeiro atende, o segundo tambem — confirmado por EXPLAIN QUERY PLAN
-- antes e depois: as duas consultas que o usavam passaram a usar o composto,
-- ambas ainda como SEARCH (busca indexada), sem virar varredura.
--
-- O ganho nao e o espaco de hoje (~4 kB, uma pagina vazia). E o de amanha:
--   - com ~1,5M contatos, este indice sozinho ocuparia dezenas de MB
--   - cada contato registrado atualiza 4 indices; passa a atualizar 3, ou seja
--     25% menos escrita nessa tabela — e o plano free limita 100 mil escritas
--     por dia
--
-- Reversivel: se algum plano de consulta piorar, basta recriar.

DROP INDEX IF EXISTS idx_followups_patient;
