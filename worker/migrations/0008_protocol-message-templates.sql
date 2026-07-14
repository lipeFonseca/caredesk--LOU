CREATE TABLE IF NOT EXISTS protocol_message_templates (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  protocol_id  TEXT NOT NULL REFERENCES contact_protocols(id) ON DELETE CASCADE,
  day_offset   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'whatsapp' CHECK (contact_type IN ('call', 'email', 'whatsapp', 'in_person')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(protocol_id, day_offset)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_protocol_day
  ON protocol_message_templates(protocol_id, day_offset);
