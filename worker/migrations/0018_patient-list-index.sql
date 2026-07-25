-- A listagem de pacientes filtra por status e ordena por surgery_date DESC.
-- Com indices separados o SQLite usa o de status pra filtrar e depois monta uma
-- arvore temporaria so pra ordenar (confirmado por EXPLAIN QUERY PLAN:
-- "USE TEMP B-TREE FOR ORDER BY").
--
-- O indice composto ja entrega as linhas na ordem final, eliminando esse passo.
-- A ordem das colunas importa: status primeiro porque e igualdade, data depois
-- porque e ordenacao — o inverso nao serviria pro filtro.
CREATE INDEX IF NOT EXISTS idx_patients_status_surgery
  ON patients(status, surgery_date DESC);

-- Mesma situacao no feed de atividade e no digest: contatos de um agente num
-- periodo. idx_followups_created serve o ORDER BY global, mas nao o recorte por
-- agente que o resumo diario faz todo dia as 20h.
CREATE INDEX IF NOT EXISTS idx_followups_agent_date
  ON followup_logs(agent_id, contact_date);
