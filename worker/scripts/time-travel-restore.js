#!/usr/bin/env node
// Restaura o D1 de PRODUÇÃO pro estado de um dia/horário específico, via D1
// Time Travel (point-in-time recovery nativo da Cloudflare — janela dos
// últimos 30 dias, confirmado no --help do próprio wrangler instalado).
//
// Ferramenta de "quebrar o vidro" pro dia do desastre, roda só no terminal de
// propósito (nunca via botão no app — exigiria guardar no Worker um token
// Cloudflare com poder de reescrever o banco de produção inteiro, alcançável
// por qualquer sessão de admin comprometida). Ver seção "Backup e restore" do
// README.
//
// Uso:
//   node scripts/time-travel-restore.js --date 2026-08-15                  # dry-run: só mostra o bookmark
//   node scripts/time-travel-restore.js --date 2026-08-15 --confirm        # restaura de verdade
//   node scripts/time-travel-restore.js --timestamp 2026-08-15T14:30:00-03:00 --confirm   # horário exato
//
// --date vira sempre o FIM daquele dia (23:59:59, fuso de Fortaleza,
// UTC-3 fixo — sem DST, mesma regra do resto do projeto): pega o máximo de
// dado bom ainda dentro do dia escolhido. Use --timestamp direto pra
// precisão maior (ex: "o problema começou às 14h, quero 13:59").
//
// Não existe "--local" aqui: Time Travel é recurso do D1 remoto por
// natureza, não tem equivalente pra ensaiar contra o banco local.

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DB_NAME = 'caredesk-sprint'

// ── Lógica pura, testável sem wrangler ──────────────────────────

export function timestampDoFimDoDia(dataYYYYMMDD) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataYYYYMMDD)) {
    throw new Error(`--date precisa estar no formato aaaa-mm-dd, recebido: "${dataYYYYMMDD}"`)
  }
  return `${dataYYYYMMDD}T23:59:59-03:00`
}

export function resolverTimestamp(args) {
  const data = valorDaFlag(args, '--date')
  const timestamp = valorDaFlag(args, '--timestamp')

  if (!data && !timestamp) {
    throw new Error('Informe --date aaaa-mm-dd ou --timestamp <RFC3339>.')
  }
  // --timestamp explícito vence quando os dois vêm juntos — é o pedido mais
  // preciso dos dois.
  return timestamp || timestampDoFimDoDia(data)
}

export function valorDaFlag(args, nome) {
  const indice = args.indexOf(nome)
  return indice === -1 ? null : args[indice + 1]
}

// ── I/O: wrangler (Cloudflare API por baixo) ────────────────────

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

function criarExecutorWrangler(cwd) {
  return function runWrangler(extraArgs) {
    const command = ['npx', 'wrangler', 'd1', 'time-travel', ...extraArgs].map(quoteArg).join(' ')
    return execSync(command, { encoding: 'utf-8', cwd, stdio: ['ignore', 'pipe', 'inherit'] })
  }
}

function buscarBookmark(runWrangler, timestamp) {
  const args = timestamp
    ? ['info', DB_NAME, '--timestamp', timestamp, '--json']
    : ['info', DB_NAME, '--json']
  const saida = runWrangler(args)
  return JSON.parse(saida).bookmark
}

async function main() {
  const args = process.argv.slice(2)
  const isConfirm = args.includes('--confirm')

  let timestamp
  try {
    timestamp = resolverTimestamp(args)
  } catch (erro) {
    console.error(`\n${erro.message}`)
    console.error('\nUso: node scripts/time-travel-restore.js --date aaaa-mm-dd [--confirm]')
    console.error('  ou: node scripts/time-travel-restore.js --timestamp <RFC3339> [--confirm]\n')
    process.exit(1)
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const runWrangler = criarExecutorWrangler(path.join(__dirname, '..'))

  console.log(`\nBanco: ${DB_NAME} (PRODUÇÃO — Time Travel só atua no remoto)`)
  console.log(`Ponto de restauração pedido: ${timestamp}`)

  const bookmarkAlvo = buscarBookmark(runWrangler, timestamp)
  console.log(`Bookmark resolvido: ${bookmarkAlvo}`)

  if (!isConfirm) {
    console.log('\nDry-run — nada foi restaurado.')
    console.log('Confira se o horário faz sentido e rode de novo com --confirm pra restaurar de verdade.\n')
    return
  }

  // Anota o bookmark ATUAL antes de mexer em qualquer coisa — é o que permite
  // desfazer esta própria restauração depois (rodar este script de novo com
  // --timestamp apontando pra este bookmark), caso o dia escolhido não fosse
  // o certo.
  const bookmarkAntes = buscarBookmark(runWrangler)
  console.log(`\nBookmark ANTES da restauração (anote pra desfazer, se precisar): ${bookmarkAntes}`)

  console.log('\nRestaurando de verdade — isso reescreve o banco de produção inteiro...')
  runWrangler(['restore', DB_NAME, '--bookmark', bookmarkAlvo])
  console.log('\nRestauração concluída.\n')
}

const chamadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (chamadoDireto) {
  main().catch((erro) => {
    console.error('\nFalha no restore via Time Travel:', erro.message)
    process.exit(1)
  })
}
