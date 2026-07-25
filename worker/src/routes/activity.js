import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'

const activity = new Hono()
activity.use('*', authMiddleware)

// ── GET /api/activity ─────────────────────────────────────────
// Feed de historico (Status.md 13.3): ultimas alteracoes do sistema, derivado
// de dados que ja existem — pacientes cadastrados (patients) e contatos feitos
// (followup_logs). Nao ha tabela de eventos; e 100% leitura, sem novo caminho
// de escrita. Ordenado por timestamp DESC, sempre paginado ({ items, total }).
activity.get('/', async (c) => {
  const { page, limit } = c.req.query()

  const pageNum  = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const offset   = (pageNum - 1) * limitNum

  // O total foi REMOVIDO de proposito. Ele era
  // `COUNT(*) FROM patients + COUNT(*) FROM followup_logs`, ou seja, lia a base
  // inteira — as duas tabelas, incluindo arquivados — a cada pagina aberta.
  // Com 300k pacientes e 1,5M contatos seriam ~1,8 MILHAO de linhas lidas por
  // carregamento, contra uma cota de 5 milhoes/dia no plano free: tres visitas
  // ao Historico esgotariam o dia.
  //
  // No lugar dele, pedimos uma linha a mais que o limite pra saber se existe
  // proxima pagina. Mesmo padrao ja usado na lista de pacientes.

  const { results: linhas } = await c.env.DB.prepare(`
    SELECT kind, ts, patient_id, patient_name, agent_name, contact_type, outcome
    FROM (
      -- COALESCE com o snapshot: agente excluido nao apaga a autoria do que ele
      -- fez. Sem isso o feed passaria a exibir a acao sem responsavel.
      SELECT
        'patient_created' AS kind,
        p.created_at      AS ts,
        p.id              AS patient_id,
        p.name            AS patient_name,
        COALESCE(ca.name, p.created_by_name) AS agent_name,
        NULL              AS contact_type,
        NULL              AS outcome
      FROM patients p
      LEFT JOIN agents ca ON p.created_by = ca.id

      UNION ALL

      SELECT
        'contact'    AS kind,
        fl.created_at AS ts,
        fl.patient_id AS patient_id,
        p.name        AS patient_name,
        COALESCE(a.name, fl.agent_name_snapshot) AS agent_name,
        fl.contact_type AS contact_type,
        fl.outcome    AS outcome
      FROM followup_logs fl
      JOIN patients p      ON fl.patient_id = p.id
      LEFT JOIN agents a   ON fl.agent_id = a.id
    )
    ORDER BY ts DESC
    LIMIT ? OFFSET ?
  `).bind(limitNum + 1, offset).all()

  const temMais = (linhas?.length ?? 0) > limitNum
  const items = temMais ? linhas.slice(0, limitNum) : (linhas ?? [])

  return c.json({ items, page: pageNum, has_more: temMais })
})

export default activity
