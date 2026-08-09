-- Remove UNIQUE(protocol_id, day_offset) de protocol_message_templates: agora
-- e permitido cadastrar mais de uma mensagem pro mesmo marco do protocolo,
-- pra variar o texto entre pacientes e evitar padrao de banimento de numero
-- no WhatsApp. Tabela-folha (nada referencia ela via FK), rebuild simples.

CREATE TABLE protocol_message_templates_new (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  protocol_id  TEXT NOT NULL REFERENCES contact_protocols(id) ON DELETE CASCADE,
  day_offset   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (contact_type IN ('call', 'email', 'whatsapp', 'in_person')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO protocol_message_templates_new (
  id, protocol_id, day_offset, title, content, contact_type, created_at, updated_at
)
SELECT
  id, protocol_id, day_offset, title, content, contact_type, created_at, updated_at
FROM protocol_message_templates;

DROP TABLE protocol_message_templates;
ALTER TABLE protocol_message_templates_new RENAME TO protocol_message_templates;

CREATE INDEX IF NOT EXISTS idx_message_templates_protocol_day ON protocol_message_templates(protocol_id, day_offset);
