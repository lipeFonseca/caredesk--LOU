-- Preserva a autoria de contatos e cadastros quando o agente e excluido.
--
-- PROBLEMA: `agent_id` tem ON DELETE SET NULL — o registro clinico sobrevive
-- (correto), mas fica sem autor. Na ficha do paciente o contato passava a
-- aparecer como "Sistema Automático", o que e factualmente errado: quem ligou
-- foi uma pessoa. Em ficha clinica, "nao sei quem fez" e pior que um nome.
--
-- SOLUCAO: snapshot do nome no momento do evento, que e como registro de
-- auditoria costuma resolver isso. O `agent_id` continua sendo a ligacao viva
-- (para juntar avatar, e-mail, etc.); o snapshot e a memoria do que era verdade
-- quando aconteceu.
--
-- A leitura usa COALESCE(nome_atual, snapshot): enquanto o agente existe,
-- correcao de digitacao ou mudanca de nome se reflete no historico; quando ele
-- some, o snapshot assume.

ALTER TABLE followup_logs ADD COLUMN agent_name_snapshot TEXT;
ALTER TABLE patients      ADD COLUMN created_by_name TEXT;

-- Backfill do que ja existe, enquanto os agentes ainda estao no banco.
UPDATE followup_logs
SET agent_name_snapshot = (SELECT name FROM agents WHERE agents.id = followup_logs.agent_id)
WHERE agent_id IS NOT NULL AND agent_name_snapshot IS NULL;

UPDATE patients
SET created_by_name = (SELECT name FROM agents WHERE agents.id = patients.created_by)
WHERE created_by IS NOT NULL AND created_by_name IS NULL;
