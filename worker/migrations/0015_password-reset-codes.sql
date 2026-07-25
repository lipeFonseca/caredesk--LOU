-- Fluxo "esqueci minha senha": codigo de 6 digitos enviado por e-mail.
-- Substitui o password_reset_tokens removido em 2026-07-13 (que nunca teve rota
-- funcional); desta vez a tabela nasce junto com as rotas que a usam.

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- Guarda so o SHA-256 do codigo: vazamento do banco nao entrega reset de conta.
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- Tentativas erradas contra ESTE codigo. 6 digitos e pouca entropia, entao o
  -- limite por codigo e a defesa principal contra adivinhacao.
  attempts   INTEGER NOT NULL DEFAULT 0,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A busca do fluxo e sempre "codigo vivo mais recente deste agente".
CREATE INDEX IF NOT EXISTS idx_password_reset_agent ON password_reset_codes(agent_id, created_at DESC);
