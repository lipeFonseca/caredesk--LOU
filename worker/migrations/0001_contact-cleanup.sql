CREATE TABLE patients_new (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name              TEXT NOT NULL,
  phone             TEXT,
  procedure         TEXT NOT NULL,
  surgery_date      TEXT NOT NULL,
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  protocol_days     TEXT NOT NULL DEFAULT '7,15,30,60,90',
  protocol_id       TEXT REFERENCES contact_protocols(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discharged')),
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO patients_new (
  id, name, phone, procedure, surgery_date, assigned_agent_id,
  protocol_days, protocol_id, status, notes, created_at, updated_at
)
SELECT
  id, name, phone, procedure, surgery_date, assigned_agent_id,
  protocol_days, protocol_id, status, notes, created_at, updated_at
FROM patients;

DROP TABLE patients;
ALTER TABLE patients_new RENAME TO patients;

CREATE INDEX IF NOT EXISTS idx_patients_agent ON patients(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

CREATE TABLE notifications_new (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id    TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('followup_due', 'followup_overdue')),
  is_read       INTEGER NOT NULL DEFAULT 0,
  scheduled_for TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO notifications_new (
  id, patient_id, agent_id, type, is_read, scheduled_for, created_at
)
SELECT
  id, patient_id, agent_id, type, is_read, scheduled_for, created_at
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notif_agent ON notifications(agent_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_date ON notifications(scheduled_for);
