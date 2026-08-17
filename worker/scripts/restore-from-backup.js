#!/usr/bin/env node
// Restaura agents/contact_protocols/patients/followup_logs a partir do backup
// no Google Sheets. Ferramenta de "quebrar o vidro" pro dia do desastre — nao
// e rota de uso comum, nem roda sozinha em cron nenhum. Ver
// docs/GOOGLE-SHEETS-BACKUP.md e a secao "Backup e restore" do README.
//
// Uso:
//   node scripts/restore-from-backup.js --url <apps-script-url> --token <token> [--remote] [--confirm]
//
// Sem --confirm: dry-run — mostra quanto seria restaurado, nao escreve nada.
// Sem --remote: roda contra D1 local (ensaio seguro).
//
// ASSUME: URL e token vem por flag, nunca lidos de app_settings. Se o D1
// sumiu de vez — o cenario que esta ferramenta existe pra cobrir — a copia
// de app_settings (onde a aba Backup guarda essas credenciais) some junto.
// Guarde as duas fora do sistema (gerenciador de senhas), nao so no painel.

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TABELAS_BACKUP } from '../src/services/sheetsBackup.js'

const DB_NAME = 'caredesk-sprint'
const LOTE_INSERT = 100

// Agente restaurado nasce sem senha de verdade (password_hash nunca sai do
// D1, de proposito) — mesmo placeholder inerte que o schema.sql ja usa pro
// admin padrao. verifyPassword() (worker/src/routes/auth.js) trata esse valor
// como "nunca autentica"; acesso volta pelo fluxo de "esqueci minha senha".
export const PLACEHOLDER_PASSWORD_HASH = '$PLACEHOLDER_HASH$'

// Colunas fixas por tabela, preenchidas pelo restore em vez de vir do backup
// — hoje so agents (password_hash e NOT NULL no schema, mas nunca sai do D1).
export const COLUNAS_FIXAS_POR_TABELA = {
  agents: { password_hash: PLACEHOLDER_PASSWORD_HASH },
}

// ── Logica pura, testavel sem wrangler nem rede ─────────────────

// null/undefined/'' viram NULL — celula vazia no Sheets e como o valor
// original ausente volta (montarLinhas, em sheetsBackup.js, grava null como
// '' na hora de escrever).
export function valorSql(valor) {
  if (valor === null || valor === undefined || valor === '') return 'NULL'
  if (typeof valor === 'number') return String(valor)
  return `'${String(valor).replace(/'/g, "''")}'`
}

export function linhasComoObjetos(sheet) {
  if (!sheet || !Array.isArray(sheet.headers) || !Array.isArray(sheet.rows)) return []
  const { headers, rows } = sheet
  return rows.map((linha) => Object.fromEntries(headers.map((coluna, i) => [coluna, linha[i]])))
}

// Monta os `INSERT OR IGNORE` (um por lote de ate 100 linhas — mesmo teto de
// parametro do D1 que o resto do projeto respeita) sem executar nada. OR
// IGNORE por id: rodar duas vezes, ou restaurar em cima de um banco
// parcialmente vivo (desastre parcial, nao perda total), nunca duplica nem
// sobrescreve o que ja esta la.
export function construirInsertsSql(tabela, colunas, objetos, colunasFixas = {}) {
  if (objetos.length === 0) return []

  const todasColunas = [...colunas, ...Object.keys(colunasFixas)]
  const valoresFixos = Object.values(colunasFixas).map((valor) => valorSql(valor))
  const comandos = []

  for (let i = 0; i < objetos.length; i += LOTE_INSERT) {
    const lote = objetos.slice(i, i + LOTE_INSERT)
    const linhasSql = lote.map((objeto) => {
      const valoresOriginais = colunas.map((coluna) => valorSql(objeto[coluna]))
      return `(${[...valoresOriginais, ...valoresFixos].join(', ')})`
    })
    comandos.push(`INSERT OR IGNORE INTO ${tabela} (${todasColunas.join(', ')}) VALUES ${linhasSql.join(', ')};`)
  }

  return comandos
}

// ── I/O: rede (Apps Script) e wrangler (D1) ─────────────────────

export async function buscarExport(url, token) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action: 'export_for_restore' }),
  })

  const corpo = await resposta.text()
  let resultado
  try {
    resultado = JSON.parse(corpo)
  } catch {
    throw new Error(`Resposta inesperada do relay de backup: ${corpo.slice(0, 200)}`)
  }

  if (!resposta.ok || !resultado.ok) {
    throw new Error(`Falha ao buscar o backup: ${resultado.error ?? resposta.status}`)
  }

  return resultado.sheets
}

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

function criarExecutorWrangler({ scopeFlag, cwd }) {
  return function runWrangler(extraArgs) {
    const command = ['npx', 'wrangler', 'd1', 'execute', DB_NAME, scopeFlag, ...extraArgs]
      .map(quoteArg)
      .join(' ')
    return execSync(command, { encoding: 'utf-8', cwd, stdio: ['ignore', 'pipe', 'inherit'] })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isRemote = args.includes('--remote')
  const isConfirm = args.includes('--confirm')
  const url = valorDaFlag(args, '--url')
  const token = valorDaFlag(args, '--token')

  if (!url || !token) {
    console.error('\nUso: node scripts/restore-from-backup.js --url <url> --token <token> [--remote] [--confirm]\n')
    process.exit(1)
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const runWrangler = criarExecutorWrangler({
    scopeFlag: isRemote ? '--remote' : '--local',
    cwd: path.join(__dirname, '..'),
  })

  function contarLinhas(tabela) {
    const saida = runWrangler(['--command', `SELECT COUNT(*) AS total FROM ${tabela};`, '--json'])
    const parsed = JSON.parse(saida)
    return parsed[0]?.results?.[0]?.total ?? 0
  }

  console.log('\nBuscando backup via Apps Script...')
  const sheets = await buscarExport(url, token)

  console.log(`\nRestore contra ${isRemote ? 'REMOTO' : 'local'} (${DB_NAME}) — ${isConfirm ? 'GRAVANDO' : 'DRY-RUN'}\n`)

  for (const tabela of TABELAS_BACKUP) {
    const objetos = linhasComoObjetos(sheets[tabela.sheet])
    const existentes = contarLinhas(tabela.table)
    console.log(`- ${tabela.sheet} (${tabela.table}): ${objetos.length} no backup, ${existentes} ja no banco de destino`)

    if (isConfirm) {
      const colunasFixas = COLUNAS_FIXAS_POR_TABELA[tabela.table] ?? {}
      const comandos = construirInsertsSql(tabela.table, tabela.colunas, objetos, colunasFixas)
      comandos.forEach((sql) => runWrangler(['--command', sql]))
      if (objetos.length > 0) console.log(`  ${objetos.length} linha(s) processada(s) (OR IGNORE — nao duplica o que ja existia)`)
    }
  }

  console.log(
    isConfirm
      ? '\nRestore concluido. Agente restaurado precisa redefinir senha via "Esqueci minha senha".\n'
      : '\nDry-run concluido — rode de novo com --confirm pra gravar de verdade.\n'
  )
}

function valorDaFlag(args, nome) {
  const indice = args.indexOf(nome)
  return indice === -1 ? null : args[indice + 1]
}

// So roda de verdade quando chamado direto (`node scripts/restore-from-backup.js`)
// — importar este arquivo num teste nao deve disparar rede nem wrangler.
const chamadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (chamadoDireto) {
  main().catch((erro) => {
    console.error('\nFalha no restore:', erro.message)
    process.exit(1)
  })
}
