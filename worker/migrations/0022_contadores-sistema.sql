-- Contadores materializados para consultas que seriam O(base inteira).
--
-- POR QUE: o D1 no plano free cobra por LINHA LIDA (5 milhões/dia). Um
-- `SELECT COUNT(*) ... WHERE status='active'` lê uma entrada de índice por
-- paciente ativo — com a janela cheia (~54k) isso é 54k linhas lidas a cada
-- carregamento do Dashboard, e a cota do dia acaba em algumas dezenas de
-- visitas.
--
-- As contagens por urgência não precisam disto: viraram range indexado
-- (`next_followup_date < date('now')`), que lê só as linhas que casam — e
-- paciente atrasado é sempre uma fração pequena da base. O total de ativos é o
-- único que exigiria varrer tudo, então é o único materializado aqui.
--
-- Mantido pelas rotas de escrita e reconciliado na faxina noturna, mesmo padrão
-- que já provou funcionar em `next_followup_date`.

CREATE TABLE IF NOT EXISTS system_counters (
  key        TEXT PRIMARY KEY,
  value      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Valor inicial calculado agora; daqui em diante é incremental.
INSERT OR REPLACE INTO system_counters (key, value)
SELECT 'patients_active', COUNT(*)
FROM patients
WHERE archived_at IS NULL AND status = 'active';
