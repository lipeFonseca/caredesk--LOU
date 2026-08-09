-- Marca contatos criados retroativamente no cadastro (paciente que ja estava
-- em acompanhamento fora do sistema). Mesmo padrao de badge informativo que
-- ja existe pra agent_removed no historico de contatos: sem essa coluna, um
-- contato retroativo fica indistinguivel de um contato real acontecido no
-- dia a dia — ambiguidade que importa num sistema de acompanhamento clinico.

ALTER TABLE followup_logs ADD COLUMN is_backfilled INTEGER NOT NULL DEFAULT 0;
