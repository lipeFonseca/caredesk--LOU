CREATE TABLE followup_logs_new (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id      TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  contact_date    TEXT NOT NULL DEFAULT (date('now')),
  contact_type    TEXT NOT NULL DEFAULT 'call' CHECK (contact_type IN ('call', 'email', 'whatsapp', 'in_person')),
  outcome         TEXT NOT NULL DEFAULT 'reached' CHECK (outcome IN ('reached', 'no_answer', 'callback_scheduled')),
  notes           TEXT,
  next_followup_date TEXT,
  is_extra_contact   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO followup_logs_new (
  id, patient_id, agent_id, contact_date, contact_type, outcome,
  notes, next_followup_date, is_extra_contact, created_at
)
SELECT
  id, patient_id, agent_id, contact_date, contact_type, outcome,
  notes, next_followup_date, is_extra_contact, created_at
FROM followup_logs;

DROP TABLE followup_logs;
ALTER TABLE followup_logs_new RENAME TO followup_logs;

CREATE INDEX IF NOT EXISTS idx_followups_patient ON followup_logs(patient_id);
