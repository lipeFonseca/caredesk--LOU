import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { JANELA_MESES, AVISO_ENCERRAMENTO_DIAS } from '../utils/patientQuery.js'
import { lerContador, CONTADOR_PACIENTES_ATIVOS } from '../utils/contadores.js'

const dashboard = new Hono()
dashboard.use('*', authMiddleware)

const LIMITE_CONTATOS_DO_DIA = 10

// ── GET /api/dashboard ────────────────────────────────────────
// Custo desta rota nao acompanha o tamanho da base — o que importa no D1 free,
// que cobra por linha lida (5 milhoes/dia).
//
// Como: as contagens por urgencia sao RANGES sobre `next_followup_date`, que
// leem so as linhas que casam (atrasado e sempre uma fracao pequena da base).
// O total de ativos, unico que exigiria varrer tudo, vem do contador
// materializado. `ok` e derivado por subtracao, sem consulta.
//
// A versao anterior fazia GROUP BY sobre todos os ativos: ~54k linhas lidas por
// carregamento com a janela cheia, ou seja, a cota diaria inteira em algumas
// dezenas de visitas.
dashboard.get('/', async (c) => {
  const [contagens, encerrando, totalAtivos, { results: contatosDoDia }] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE next_followup_date <  date('now')) AS overdue,
        COUNT(*) FILTER (WHERE next_followup_date =  date('now')) AS due,
        COUNT(*) FILTER (WHERE next_followup_date >  date('now')
                           AND next_followup_date <= date('now', '+2 days')) AS soon
      FROM patients
      WHERE archived_at IS NULL
        AND status = 'active'
        AND next_followup_date IS NOT NULL
        AND next_followup_date <= date('now', '+2 days')
    `).first(),

    // `surgery_date <= date('now','-5 months')` em vez de
    // `date(surgery_date,'+6 months') <= date('now','+30 days')`: sao
    // equivalentes, mas funcao sobre a coluna impede o uso do indice e forca
    // varredura de todos os ativos. Confirmado por EXPLAIN QUERY PLAN.
    c.env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM patients
      WHERE archived_at IS NULL
        AND status = 'active'
        AND surgery_date <= date('now', '-${JANELA_MESES} months', '+${AVISO_ENCERRAMENTO_DIAS} days')
    `).first(),

    lerContador(c.env.DB, CONTADOR_PACIENTES_ATIVOS),

    c.env.DB.prepare(`
      SELECT
        p.id, p.name, p.phone, p.procedure, p.surgery_date, p.next_followup_date,
        COALESCE(a.name, p.created_by_name) AS agent_name,
        CASE
          WHEN p.next_followup_date <  date('now') THEN 'overdue'
          WHEN p.next_followup_date =  date('now') THEN 'due'
          ELSE 'soon'
        END AS followup_urgency
      FROM patients p
      LEFT JOIN agents a ON p.assigned_agent_id = a.id
      WHERE p.archived_at IS NULL
        AND p.status = 'active'
        AND p.next_followup_date IS NOT NULL
        AND p.next_followup_date <= date('now', '+2 days')
      ORDER BY p.next_followup_date ASC
      LIMIT ?
    `).bind(LIMITE_CONTATOS_DO_DIA).all(),
  ])

  const overdue = contagens?.overdue ?? 0
  const due     = contagens?.due ?? 0
  const soon    = contagens?.soon ?? 0

  return c.json({
    stats: {
      total:   totalAtivos,
      overdue,
      due,
      soon,
      // Derivado: quem nao esta atrasado, vencendo ou proximo esta em dia.
      // Evita uma quarta consulta que teria de varrer a base inteira.
      ok: Math.max(0, totalAtivos - overdue - due - soon),
      ending_soon: encerrando?.total ?? 0,
    },
    today_contacts: contatosDoDia ?? [],
  })
})

export default dashboard
