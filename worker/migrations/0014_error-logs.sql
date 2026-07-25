-- Frente B (roadmap de escalabilidade, Status.md 2026-07-20): aba de Logs.
-- Registra APENAS erro de servidor (500 / excecao nao tratada capturada no
-- app.onError). Escopo decidido com o usuario: nada de 4xx nem evento de
-- seguranca aqui — o caminho de escrita so dispara quando algo ja quebrou.

CREATE TABLE IF NOT EXISTS error_logs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  method      TEXT,
  path        TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  -- agent_id/agent_email sao snapshot, sem FK proposital: log e registro
  -- historico do que aconteceu naquele instante. Uma FK com ON DELETE SET NULL
  -- apagaria a autoria do erro ao desligar um agente, que e justamente quando
  -- a informacao mais importa.
  agent_id    TEXT,
  agent_email TEXT,
  ip          TEXT
);

-- A aba lista sempre por data decrescente e a limpeza de retencao filtra pela
-- mesma coluna — um indice serve os dois.
CREATE INDEX IF NOT EXISTS idx_error_logs_occurred ON error_logs(occurred_at DESC);
