-- ============================================================
-- CareDesk · Schema D1 (Cloudflare SQLite)
-- ============================================================

-- Agentes / Especialistas CS
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  telegram_chat_id TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pacientes
CREATE TABLE IF NOT EXISTS patients (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name            TEXT NOT NULL,
  phone           TEXT,
  procedure       TEXT NOT NULL,
  surgery_date    TEXT NOT NULL,
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  protocol_days   TEXT NOT NULL DEFAULT '7,15,30,60,90',
  protocol_id     TEXT REFERENCES contact_protocols(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discharged')),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log de Follow-ups
CREATE TABLE IF NOT EXISTS followup_logs (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id      TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  contact_date    TEXT NOT NULL DEFAULT (date('now')),
  contact_type    TEXT NOT NULL DEFAULT 'call' CHECK (contact_type IN ('call', 'whatsapp', 'email', 'in_person')),
  outcome         TEXT NOT NULL DEFAULT 'reached' CHECK (outcome IN ('reached', 'no_answer', 'callback_scheduled')),
  notes           TEXT,
  next_followup_date TEXT,
  is_extra_contact   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notificações internas
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id      TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('followup_due', 'followup_overdue')),
  is_read         INTEGER NOT NULL DEFAULT 0,
  sent_whatsapp   INTEGER NOT NULL DEFAULT 0,
  scheduled_for   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Templates de protocolo de contato
CREATE TABLE IF NOT EXISTS contact_protocols (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  description TEXT,
  days        TEXT NOT NULL DEFAULT '[]',
  color       TEXT NOT NULL DEFAULT '#6366f1',
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_custom   INTEGER NOT NULL DEFAULT 0,
  contact_channel TEXT NOT NULL DEFAULT 'internal',
  automation_enabled INTEGER NOT NULL DEFAULT 0,
  message_template TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configurações visuais e gerais da aplicação
CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rate limiting de login (controle de tentativas por IP)
CREATE TABLE IF NOT EXISTS login_rate_limit (
  key         TEXT PRIMARY KEY,
  attempts    INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tokens para reset de senha
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  used            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Índices de performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_patients_agent    ON patients(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_patients_status   ON patients(status);
CREATE INDEX IF NOT EXISTS idx_followups_patient ON followup_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_notif_agent       ON notifications(agent_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_date        ON notifications(scheduled_for);

-- ============================================================
-- Dados iniciais
-- ============================================================

-- Protocolos padrão
INSERT OR IGNORE INTO contact_protocols (id, name, description, days, color, is_default) VALUES
  ('proto-padrao-000000000001', 'Padrão',
   'Acompanhamento padrão pós-cirúrgico de 6 meses',
   '[-2,0,10,20,30,60,90,120,150,180]', '#6366f1', 1),
  ('proto-atencao-00000000001', '+ Atenção',
   'Protocolo intensivo para pacientes que precisam de mais cuidado',
   '[-5,-2,0,5,10,15,20,30,45,60,90,120,150,180]', '#ef4444', 0);

-- Configurações padrão da aplicação
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('clinic_name',           'CareDesk'),
  ('primary_color',         '#6366f1'),
  ('logo_url',              ''),
  ('timezone',              'America/Fortaleza'),
  ('contact_protocol_days', '[-2,0,2,5,15,30,60,90,120,180]');

-- Admin padrão (senha: Admin@2025 — TROCAR NO PRIMEIRO ACESSO)
-- hash bcrypt gerado fora do SQLite via Worker no setup
INSERT OR IGNORE INTO agents (id, name, email, password_hash, role)
  VALUES (
    'admin-default-0000-0000-000000000001',
    'Administrador',
    'admin@caredesk.local',
    '$PLACEHOLDER_HASH$',
    'admin'
  );
