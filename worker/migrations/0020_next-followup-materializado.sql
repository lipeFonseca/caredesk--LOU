-- Materializa a data do proximo marco de acompanhamento em `patients`.
--
-- PROBLEMA QUE RESOLVE: o Dashboard carregava TODOS os pacientes ativos e
-- calculava urgencia em JavaScript no navegador. Com a janela ativa cheia
-- (~54k pacientes) isso vira dezenas de MB por carregamento.
--
-- POR QUE SO A DATA, E NAO A URGENCIA: urgencia e funcao de (proximo marco vs
-- hoje) — ela muda sozinha com a virada do dia, sem ninguem tocar no registro.
-- Materializar urgencia exigiria um cron varrendo a base inteira todo dia.
-- Materializando a DATA, que so muda por evento real (cadastro, edicao, contato
-- registrado), a urgencia sai em SQL na hora da consulta e nunca desatualiza.
--
-- NULL significa "sem proximo marco": paciente sem protocolo, protocolo
-- concluido, ou fora de `active`.

ALTER TABLE patients ADD COLUMN next_followup_date TEXT;

-- Serve as duas consultas do Dashboard: o GROUP BY dos indicadores e a lista
-- dos proximos contatos ordenada por data. Parcial pelo mesmo motivo dos outros:
-- paciente arquivado nao entra em nenhuma das duas.
CREATE INDEX IF NOT EXISTS idx_patients_proximo_marco
  ON patients(next_followup_date) WHERE archived_at IS NULL;

-- Backfill NAO acontece aqui: calcular o proximo marco exige interpretar o JSON
-- de dias do protocolo e contar followups, o que nao se faz bem em SQL puro.
-- As linhas nascem com NULL e sao preenchidas pela rotina de reconciliacao da
-- faxina noturna, que ja precisa existir de qualquer forma como rede de
-- seguranca contra desincronizacao.
