-- ============================================================
-- CareDesk · Schema D1 (Cloudflare SQLite)
-- ============================================================

-- Agentes / Especialistas CS
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  is_active   INTEGER NOT NULL DEFAULT 1,
  avatar_url  TEXT,
  avatar_storage_key TEXT,
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
  protocol_id     TEXT REFERENCES contact_protocols(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discharged')),
  notes           TEXT,
  created_by      TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log de Follow-ups
CREATE TABLE IF NOT EXISTS followup_logs (
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

-- Notificações internas
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id      TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('followup_due', 'followup_overdue')),
  is_read         INTEGER NOT NULL DEFAULT 0,
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
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Templates de mensagem vinculados aos marcos do protocolo
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

-- Catálogo de documentos configurado pelo admin (enviar ao paciente / solicitar do paciente)
CREATE TABLE IF NOT EXISTS document_templates (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('send', 'request')),
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documentos do catálogo atribuídos a um paciente + status de acompanhamento
CREATE TABLE IF NOT EXISTS patient_documents (
  id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  patient_id            TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  document_template_id  TEXT NOT NULL REFERENCES document_templates(id) ON DELETE RESTRICT,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(patient_id, document_template_id)
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

-- Erros de servidor (500) gravados pelo app.onError e lidos pela aba de Logs.
-- agent_id/agent_email sao snapshot sem FK: o log e registro historico e nao
-- pode perder a autoria quando o agente e removido.
CREATE TABLE IF NOT EXISTS error_logs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  method      TEXT,
  path        TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  agent_id    TEXT,
  agent_email TEXT,
  ip          TEXT
);

-- Codigos de 6 digitos do fluxo "esqueci minha senha" (enviados por e-mail).
-- Guarda so o SHA-256 do codigo; validade curta e limite de tentativas por
-- codigo compensam a entropia baixa de 6 digitos.
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Templates de e-mail editaveis pelo admin (aba Mensageria). Tabela propria
-- porque corpo de e-mail e texto longo; app_settings e chave/valor curto.
-- Uma linha por tipo: nao ha versionamento nem multiplos templates por tipo.
CREATE TABLE IF NOT EXISTS email_templates (
  tipo       TEXT PRIMARY KEY CHECK (tipo IN ('password_reset', 'daily_digest')),
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Índices de performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_patients_agent    ON patients(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_patients_status   ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_surgery_date ON patients(surgery_date);
CREATE INDEX IF NOT EXISTS idx_patients_protocol ON patients(protocol_id);
CREATE INDEX IF NOT EXISTS idx_followups_patient ON followup_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_followups_patient_date ON followup_logs(patient_id, contact_date DESC);
CREATE INDEX IF NOT EXISTS idx_followups_created ON followup_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_created  ON patients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_agent       ON notifications(agent_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_date        ON notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_message_templates_protocol_day ON protocol_message_templates(protocol_id, day_offset);
CREATE INDEX IF NOT EXISTS idx_document_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient   ON patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_template  ON patient_documents(document_template_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_occurred ON error_logs(occurred_at DESC);
-- Compostos: entregam as linhas ja na ordem/recorte que a rota pede, evitando
-- a arvore temporaria que os indices de coluna unica deixavam acontecer.
CREATE INDEX IF NOT EXISTS idx_patients_status_surgery ON patients(status, surgery_date DESC);
CREATE INDEX IF NOT EXISTS idx_followups_agent_date    ON followup_logs(agent_id, contact_date);
CREATE INDEX IF NOT EXISTS idx_password_reset_agent ON password_reset_codes(agent_id, created_at DESC);

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
  ('background_image_url',  ''),
  ('login_image_url',       ''),
  ('login_background_image_url', ''),
  ('favicon_url',           ''),
  ('login_border_effect_enabled', '0'),
  ('login_border_preset',         'default'),
  ('login_border_color_1',        '#0dc1fd'),
  ('login_border_color_2',        '#d915ef'),
  ('login_border_color_3',        '#ff3f2ecc'),
  ('login_border_color_back',     '#00000000'),
  ('login_border_intensity',      '0.20'),
  ('login_border_speed',          '1.00'),
  ('login_border_thickness',      '0.10'),
  ('login_border_bloom',          '0.25'),
  ('timezone',              'America/Fortaleza');

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
