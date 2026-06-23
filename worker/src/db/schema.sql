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
  email           TEXT,
  procedure       TEXT NOT NULL,
  surgery_date    TEXT NOT NULL,
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  protocol_days   TEXT NOT NULL DEFAULT '7,15,30,60,90',
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
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notificações internas
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id      TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('followup_due', 'followup_overdue')),
  is_read         INTEGER NOT NULL DEFAULT 0,
  sent_telegram   INTEGER NOT NULL DEFAULT 0,
  sent_email      INTEGER NOT NULL DEFAULT 0,
  scheduled_for   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configuração do Telegram Bot
CREATE TABLE IF NOT EXISTS telegram_config (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  bot_token       TEXT,
  default_chat_id TEXT,
  notify_group    INTEGER NOT NULL DEFAULT 0,
  group_chat_id   TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configurações visuais e gerais da aplicação
CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Configurações padrão da aplicação
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('clinic_name',    'CareDesk'),
  ('primary_color',  '#6366f1'),
  ('logo_url',       ''),
  ('timezone',       'America/Fortaleza');

-- Config telegram vazia (será preenchida no admin)
INSERT OR IGNORE INTO telegram_config (id, bot_token, default_chat_id)
  VALUES (1, '', '');

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
