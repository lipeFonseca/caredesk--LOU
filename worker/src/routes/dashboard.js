import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { SQL_URGENCIA } from '../utils/proximoMarco.js'
import { JANELA_MESES, AVISO_ENCERRAMENTO_DIAS } from '../utils/patientQuery.js'

const dashboard = new Hono()
dashboard.use('*', authMiddleware)

// Quantos pacientes a lista de "contatos para hoje" mostra. O Dashboard exibia
// 10 depois de carregar a base inteira; agora o corte acontece no banco.
const LIMITE_CONTATOS_DO_DIA = 10

// ── GET /api/dashboard ────────────────────────────────────────
// Substitui o carregamento de todos os pacientes ativos no navegador. Duas
// consultas agregadas, ambas servidas pelo indice de next_followup_date, com
// custo praticamente constante em relacao ao tamanho da base.
dashboard.get('/', async (c) => {
  const { results: contagens } = await c.env.DB.prepare(`
    SELECT ${SQL_URGENCIA} AS urgencia, COUNT(*) AS total
    FROM patients p
    WHERE p.archived_at IS NULL AND p.status = 'active'
    GROUP BY urgencia
  `).all()

  const porUrgencia = Object.fromEntries((contagens ?? []).map((l) => [l.urgencia, l.total]))
  const totalAtivos = (contagens ?? []).reduce((soma, l) => soma + l.total, 0)

  // Quem sai do acompanhamento em breve. Sem esse aviso o paciente some da
  // lista de um dia pro outro, sem ninguem ver chegando.
  const encerrando = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM patients p
    WHERE p.archived_at IS NULL
      AND p.status = 'active'
      AND date(p.surgery_date, '+${JANELA_MESES} months') <= date('now', '+${AVISO_ENCERRAMENTO_DIAS} days')
  `).first()

  // Ordem por data crescente ja entrega atrasado antes de vencido antes de
  // proximo — o mesmo criterio que o front aplicava ordenando em memoria.
  const { results: contatosDoDia } = await c.env.DB.prepare(`
    SELECT
      p.id, p.name, p.phone, p.procedure, p.surgery_date, p.next_followup_date,
      a.name AS agent_name,
      ${SQL_URGENCIA} AS followup_urgency
    FROM patients p
    LEFT JOIN agents a ON p.assigned_agent_id = a.id
    WHERE p.archived_at IS NULL
      AND p.status = 'active'
      AND p.next_followup_date IS NOT NULL
      AND p.next_followup_date <= date('now', '+2 days')
    ORDER BY p.next_followup_date ASC
    LIMIT ?
  `).bind(LIMITE_CONTATOS_DO_DIA).all()

  return c.json({
    stats: {
      total:   totalAtivos,
      overdue: porUrgencia.overdue ?? 0,
      due:     porUrgencia.due ?? 0,
      soon:    porUrgencia.soon ?? 0,
      ok:      porUrgencia.ok ?? 0,
      ending_soon: encerrando?.total ?? 0,
    },
    today_contacts: contatosDoDia ?? [],
  })
})

export default dashboard
