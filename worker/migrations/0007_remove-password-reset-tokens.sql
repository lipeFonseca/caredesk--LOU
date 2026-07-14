-- Remove tabela orfa: nunca teve rota funcional associada (reset de senha
-- hoje e feito exclusivamente por admin via POST /api/agents/:id/reset-password).
DROP TABLE IF EXISTS password_reset_tokens;
