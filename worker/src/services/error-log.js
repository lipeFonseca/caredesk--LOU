// Persistencia dos erros de servidor que alimentam a aba de Logs.
// Escrito a partir do app.onError; lido por GET /api/logs.

// Retencao: sem isso a tabela cresce indefinidamente no D1. A limpeza roda
// junto do scheduler diario (services/scheduler.js).
export const RETENTION_DAYS = 30

const MAX_MESSAGE_LENGTH = 500
const MAX_STACK_LENGTH   = 4000

// ── Grava um erro de servidor ─────────────────────────────────
// Nunca rejeita: e chamada de dentro do error handler, onde uma falha aqui
// mascararia o erro original e derrubaria a resposta 500 do cliente.
export async function recordServerError(env, error, c) {
  try {
    // Presente so se o erro estourou depois do authMiddleware.
    const agent = c.get('agent')

    await env.DB.prepare(`
      INSERT INTO error_logs (method, path, message, stack, agent_id, agent_email, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      c.req.method,
      c.req.path,
      truncar(error?.message || String(error), MAX_MESSAGE_LENGTH),
      truncar(error?.stack, MAX_STACK_LENGTH),
      agent?.id ?? null,
      agent?.email ?? null,
      c.req.header('CF-Connecting-IP') ?? null,
    ).run()
  } catch (falhaAoGravar) {
    console.error('[error_logs] falha ao gravar erro no banco', falhaAoGravar)
  }
}

// ── Limpeza por retencao ──────────────────────────────────────
// Retorna quantas linhas sairam (o scheduler loga o numero).
export async function purgeOldErrorLogs(env) {
  const { meta } = await env.DB.prepare(`
    DELETE FROM error_logs WHERE occurred_at < datetime('now', ?)
  `).bind(`-${RETENTION_DAYS} days`).run()

  return meta?.changes ?? 0
}

function truncar(valor, limite) {
  if (!valor) return null
  return valor.length > limite ? valor.slice(0, limite) : valor
}
