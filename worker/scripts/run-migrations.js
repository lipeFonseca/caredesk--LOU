#!/usr/bin/env node
// Aplica todas as migrations em worker/migrations/*.sql em ordem, pulando as que
// ja foram aplicadas (rastreadas na tabela _migrations do proprio D1).
// Uso: node scripts/run-migrations.js [--remote]
//
// --bootstrap: marca todas as migrations existentes como ja aplicadas SEM rodar
// o SQL delas. Usar uma unica vez num banco que ja tem o schema em dia (aplicado
// manualmente antes deste script existir), para nao tentar reaplicar ALTER TABLE
// nao-idempotente contra dados reais.

import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')
const DB_NAME = 'caredesk-sprint'
const isRemote = process.argv.includes('--remote')
const isBootstrap = process.argv.includes('--bootstrap')
const scopeFlag = isRemote ? '--remote' : '--local'

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

function runWrangler(extraArgs) {
  const command = ['npx', 'wrangler', 'd1', 'execute', DB_NAME, scopeFlag, ...extraArgs]
    .map(quoteArg)
    .join(' ')
  return execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })
}

// --command (nao --file) para as operacoes de tracking: sao queries curtas,
// sem o overhead/aviso de upload assincrono que o --file dispara, o que polui
// o stdout e ja quebrou o parsing de --json numa rodada anterior.
function runCommand(sql, extraArgs = []) {
  return runWrangler(['--command', sql, ...extraArgs])
}

function ensureTrackingTable() {
  runCommand("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));")
}

function getAppliedMigrations() {
  const output = runCommand('SELECT name FROM _migrations;', ['--json'])
  let parsed
  try {
    parsed = JSON.parse(output)
  } catch (err) {
    // Nao assumir "nada aplicado" em caso de falha de parsing — isso e o pior
    // cenario possivel (levaria a reaplicar migrations nao-idempotentes contra
    // dados reais). Prefere abortar alto e claro.
    console.error('\nNao foi possivel ler a tabela _migrations (saida inesperada do wrangler).')
    console.error('Saida bruta recebida:\n', output)
    throw new Error('Abortando: nao da para confirmar com seguranca quais migrations ja foram aplicadas.', { cause: err })
  }
  const results = parsed[0]?.results || []
  return new Set(results.map((row) => row.name))
}

function markApplied(name) {
  runCommand(`INSERT OR IGNORE INTO _migrations (name) VALUES ('${name}');`)
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()

console.log(`\nAplicando migrations em ${isRemote ? 'REMOTO' : 'local'} (${DB_NAME})...\n`)

ensureTrackingTable()
const applied = getAppliedMigrations()

let ranAny = false
for (const file of files) {
  if (applied.has(file)) {
    console.log(`- ${file}: ja aplicada, pulando`)
    continue
  }

  if (isBootstrap) {
    console.log(`- ${file}: marcando como aplicada (--bootstrap, SQL nao executado)`)
    markApplied(file)
    ranAny = true
    continue
  }

  console.log(`- ${file}: aplicando...`)
  runWrangler(['--file', path.join(MIGRATIONS_DIR, file)])
  markApplied(file)
  ranAny = true
  console.log('  ok')
}

console.log(ranAny ? '\nConcluido.\n' : '\nNada para aplicar, tudo ja estava em dia.\n')
