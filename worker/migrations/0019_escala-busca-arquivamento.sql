-- Preparacao pra escala real: centenas de milhares de pacientes, 100-300
-- cadastros por dia. Tres frentes, todas confirmadas contra o D1 antes de virar
-- migration (FTS5 e `remove_diacritics 2` testados no remoto).
--
-- 1. ARQUIVAMENTO: paciente sai do acompanhamento aos 6 meses. Em vez de mover
--    de tabela (que duplicaria toda consulta historica), ganha `archived_at` e
--    os indices do dia a dia passam a ser PARCIAIS. Assim o indice cobre so a
--    janela ativa (~54k linhas a 300/dia) mesmo com 300k na tabela — e isso,
--    nao o indice em si, e o que impede a degradacao ao longo dos anos.
--
-- 2. BUSCA POR NOME: FTS5. `LIKE '%termo%'` faz SCAN por construcao (curinga a
--    esquerda inviabiliza B-tree), entao nenhum indice comum resolveria.
--
-- 3. BUSCA POR TELEFONE: FTS tokeniza numero pontuado de forma imprevisivel.
--    Coluna `phone_digits` (so digitos) + indice permite prefixo `LIKE '8598%'`,
--    que USA indice justamente por nao ter curinga a esquerda.

-- ── 1. Arquivamento ──────────────────────────────────────────
-- NULL = em acompanhamento. Data = quando saiu.
ALTER TABLE patients ADD COLUMN archived_at TEXT;

-- ── 2. Telefone normalizado ──────────────────────────────────
ALTER TABLE patients ADD COLUMN phone_digits TEXT;

-- Backfill do que ja existe. A sanitizacao de entrada so admite digito, +, (, ),
-- espaco e hifen, entao esses replaces cobrem todo o formato possivel.
UPDATE patients
SET phone_digits = replace(replace(replace(replace(replace(
      COALESCE(phone, ''), '(', ''), ')', ''), ' ', ''), '-', ''), '+', '')
WHERE phone IS NOT NULL AND phone <> '';

-- ── 3. Indices parciais do dia a dia ─────────────────────────
-- Todos com WHERE archived_at IS NULL: paciente arquivado nao entra em
-- listagem nem busca operacional, entao nao tem por que ocupar o indice.
--
-- `id` no fim de cada um serve a paginacao por cursor: surgery_date sozinho nao
-- e unico, e sem desempate a pagina seguinte pode repetir ou pular registro.
CREATE INDEX IF NOT EXISTS idx_patients_ativos_ordem
  ON patients(surgery_date DESC, id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_ativos_status
  ON patients(status, surgery_date DESC, id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_ativos_agente
  ON patients(assigned_agent_id, surgery_date DESC, id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_ativos_telefone
  ON patients(phone_digits) WHERE archived_at IS NULL;

-- Serve o cron de arquivamento, que procura quem passou da janela.
CREATE INDEX IF NOT EXISTS idx_patients_archived
  ON patients(archived_at);

-- Redundantes agora: `idx_patients_status` e prefixo do composto parcial, e
-- `idx_patients_status_surgery` (criado horas atras, na migration 0018) e a
-- versao nao-parcial do mesmo indice. Manter os dois so gastaria escrita a cada
-- INSERT sem nunca ser escolhido.
DROP INDEX IF EXISTS idx_patients_status;
DROP INDEX IF EXISTS idx_patients_status_surgery;

-- ── 4. Busca textual (FTS5) ──────────────────────────────────
-- `content='patients'`: indice externo, sem copiar o texto — o FTS guarda so os
-- termos e aponta pro rowid da tabela real.
-- `remove_diacritics 2`: "joao" encontra "João". Testado no D1 remoto.
CREATE VIRTUAL TABLE IF NOT EXISTS patients_fts USING fts5(
  name,
  procedure,
  email,
  content='patients',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- Indice externo NAO se atualiza sozinho: sem estes triggers, a busca congela no
-- estado do backfill e passa a mentir silenciosamente.
CREATE TRIGGER IF NOT EXISTS patients_fts_insert AFTER INSERT ON patients BEGIN
  INSERT INTO patients_fts(rowid, name, procedure, email)
  VALUES (new.rowid, new.name, new.procedure, new.email);
END;

CREATE TRIGGER IF NOT EXISTS patients_fts_delete AFTER DELETE ON patients BEGIN
  INSERT INTO patients_fts(patients_fts, rowid, name, procedure, email)
  VALUES ('delete', old.rowid, old.name, old.procedure, old.email);
END;

-- UPDATE em FTS externo e delete + insert; nao existe update direto.
CREATE TRIGGER IF NOT EXISTS patients_fts_update AFTER UPDATE ON patients BEGIN
  INSERT INTO patients_fts(patients_fts, rowid, name, procedure, email)
  VALUES ('delete', old.rowid, old.name, old.procedure, old.email);
  INSERT INTO patients_fts(rowid, name, procedure, email)
  VALUES (new.rowid, new.name, new.procedure, new.email);
END;

INSERT INTO patients_fts(rowid, name, procedure, email)
SELECT rowid, name, procedure, email FROM patients;
