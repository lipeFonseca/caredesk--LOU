import { Hono } from 'hono'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  attachResolvedProtocol,
  buildProtocolMilestones,
  calcProtocolUrgency,
  parseProtocolDays,
  resolvePatientProtocol,
} from '../utils/protocols.js'
import { resolveSuggestedMessageTemplate, isValidMessageTemplateContactType } from '../utils/messageTemplates.js'
import { isValidDocumentStatus } from '../utils/documentTemplates.js'
import { sanitizeOptionalPhone, sanitizeOptionalEmail, sanitizeRequiredCpf, phoneDigits } from '../utils/contactFields.js'
import {
  buildPatientFilters,
  classifySearchTerm,
  decodeCursor,
  encodeCursor,
  normalizePageSize,
  isValidPatientStatus,
  normalizeArchivedFilter,
  SQL_DIAS_ATE_ARQUIVAR,
  AVISO_ENCERRAMENTO_DIAS,
} from '../utils/patientQuery.js'
import { recalcularProximoMarco } from '../utils/proximoMarco.js'
import {
  ajustarContador,
  contaComoAtivo,
  CONTADOR_PACIENTES_ATIVOS,
  CONTADOR_PACIENTES_TOTAL,
  CONTADOR_CONTATOS,
} from '../utils/contadores.js'
import { arquivarPacientes, desarquivarPacientes } from '../services/arquivamento.js'

const patients = new Hono()
patients.use('*', authMiddleware)

// ── GET /api/patients ─────────────────────────────────────────
// `page` e opcional: quando ausente, mantem o comportamento historico de
// retornar todos os registros que casam com o filtro (usado hoje pelo
// Dashboard, que precisa da base ativa inteira pra calcular KPIs). Quando
// presente, aplica LIMIT/OFFSET e a resposta inclui `total` pra paginacao
// no frontend.
patients.get('/', async (c) => {
  const { status, agent_id, from, to, search, page, limit, cursor, archived, ending_soon } = c.req.query()

  const filtros = buildPatientFilters({
    status, agent_id, from, to,
    archived: normalizeArchivedFilter(archived),
    endingSoon: ending_soon === '1',
  })

  let whereSql = filtros.sql
  const binds = [...filtros.binds]

  // Busca: FTS pra texto, prefixo indexado pra telefone. O `LIKE '%termo%'`
  // anterior fazia SCAN da tabela inteira a cada tecla digitada.
  const termoBuscado = classifySearchTerm(search)
  if (termoBuscado.kind === 'text' && termoBuscado.query) {
    whereSql += `${whereSql ? ' AND' : ' WHERE'} p.rowid IN (SELECT rowid FROM patients_fts WHERE patients_fts MATCH ?)`
    binds.push(termoBuscado.query)
  } else if (termoBuscado.kind === 'phone') {
    whereSql += `${whereSql ? ' AND' : ' WHERE'} p.phone_digits LIKE ?`
    binds.push(`%${termoBuscado.digits}%`)
  }

  // Cursor e a paginacao padrao (custo constante em qualquer profundidade).
  // `page` continua aceito porque o Dashboard e telas antigas ainda usam, e
  // porque OFFSET raso nao incomoda — o problema so aparece paginando fundo.
  const tamanhoDaPagina = normalizePageSize(limit)
  const posicao = decodeCursor(cursor)

  let paginacaoSql = ''
  const queryBinds = [...binds]

  if (posicao) {
    // Comparacao lexicografica de tupla: pega tudo estritamente "depois" da
    // ultima linha entregue, na ordem (surgery_date DESC, id DESC).
    whereSql += `${whereSql ? ' AND' : ' WHERE'} (p.surgery_date < ? OR (p.surgery_date = ? AND p.id < ?))`
    queryBinds.push(posicao.surgery_date, posicao.surgery_date, posicao.id)
    paginacaoSql = ' LIMIT ?'
    queryBinds.push(tamanhoDaPagina + 1)
  } else {
    const pageNum = parseInt(page, 10)
    if (Number.isInteger(pageNum) && pageNum > 0) {
      paginacaoSql = ' LIMIT ? OFFSET ?'
      queryBinds.push(tamanhoDaPagina, (pageNum - 1) * tamanhoDaPagina)
    } else if (cursor !== undefined || limit !== undefined) {
      // Primeira página do modo cursor.
      paginacaoSql = ' LIMIT ?'
      queryBinds.push(tamanhoDaPagina + 1)
    }
  }

  // COUNT(*) varre o resultado inteiro do filtro; em base grande custa quase
  // tanto quanto a propria listagem. So e calculado quando alguem usa `page`,
  // que e o unico modo que precisa saber o total pra montar os numeros.
  const usaContagem = !posicao && Number.isInteger(parseInt(page, 10))
  const total = usaContagem
    ? (await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM patients p ${whereSql}`).bind(...binds).first())?.total ?? 0
    : null

  const sql = `
    SELECT
      p.*,
      a.name  AS agent_name,
      cp.name AS protocol_name,
      cp.days AS _proto_days,
      cp.color AS protocol_color,
      (SELECT contact_date FROM followup_logs WHERE patient_id = p.id ORDER BY contact_date DESC LIMIT 1) AS last_contact_date,
      (SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id AND is_extra_contact = 0) AS total_followups,
      ${SQL_DIAS_ATE_ARQUIVAR} AS days_until_archive
    FROM patients p
    LEFT JOIN agents a           ON p.assigned_agent_id = a.id
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    ${whereSql}
    ORDER BY p.surgery_date DESC, p.id DESC
    ${paginacaoSql}
  `

  const { results: linhas } = await c.env.DB.prepare(sql).bind(...queryBinds).all()

  // Pedimos uma linha a mais só pra saber se existe próxima página, sem um
  // COUNT separado. Ela não vai na resposta.
  const modoCursor = paginacaoSql === ' LIMIT ?'
  const temMais = modoCursor && linhas.length > tamanhoDaPagina
  const results = temMais ? linhas.slice(0, tamanhoDaPagina) : linhas
  const proximoCursor = temMais ? encodeCursor(results[results.length - 1]) : null

  const today = new Date().toISOString().split('T')[0]
  const enriched = results.map(p => {
    const resolution = resolvePatientProtocol(p)
    const { _proto_days, ...rest } = p
    const withProtocol = attachResolvedProtocol(rest, resolution)
    return {
      ...withProtocol,
      followup_urgency: calcProtocolUrgency(withProtocol, resolution.days, today),
    }
  })

  return c.json({ patients: enriched, total, next_cursor: proximoCursor })
})

// ── Arquivar / desarquivar ────────────────────────────────────
// Sem `adminOnly`: quem faz o contato é o agente, e é ele quem sabe se o
// paciente ainda está em acompanhamento. As duas ações são reversíveis uma pela
// outra e não perdem dado — diferente de excluir, que segue restrito a admin.
//
// As rotas em massa vêm ANTES de `/:id/...`: o Hono casa na ordem de registro e
// leria "archive" como se fosse um id de paciente.

patients.post('/archive', async (c) => {
  const ids = await lerIdsDoCorpo(c)
  if (ids.error) return c.json({ error: ids.error }, 400)

  const arquivados = await arquivarPacientes(c.env.DB, ids.value)
  return c.json({ success: true, arquivados })
})

patients.post('/unarchive', async (c) => {
  const ids = await lerIdsDoCorpo(c)
  if (ids.error) return c.json({ error: ids.error }, 400)

  const restaurados = await desarquivarPacientes(c.env.DB, ids.value, { recalcular: recalcularProximoMarco })
  return c.json({ success: true, restaurados })
})

patients.post('/:id/archive', async (c) => {
  const arquivados = await arquivarPacientes(c.env.DB, [c.req.param('id')])

  if (!arquivados) return c.json({ error: 'Paciente não encontrado ou já arquivado' }, 404)
  return c.json({ success: true })
})

patients.post('/:id/unarchive', async (c) => {
  const restaurados = await desarquivarPacientes(c.env.DB, [c.req.param('id')], { recalcular: recalcularProximoMarco })

  if (!restaurados) return c.json({ error: 'Paciente não encontrado ou já ativo' }, 404)
  return c.json({ success: true })
})

// Teto de 200 por chamada: acima disso o Worker arrisca estourar o tempo, e a
// operação deixa de ser algo que alguém conferiu na tela.
async function lerIdsDoCorpo(c) {
  const { ids } = await c.req.json().catch(() => ({}))

  if (!Array.isArray(ids) || !ids.length) return { error: 'Informe os pacientes' }
  if (ids.length > 200) return { error: 'No máximo 200 pacientes por vez' }

  return { value: ids }
}

// ── GET /api/patients/:id ─────────────────────────────────────
patients.get('/:id', async (c) => {
  const patient = await c.env.DB.prepare(`
    SELECT p.*, a.name AS agent_name,
           cp.name AS protocol_name, cp.days AS protocol_days_json,
           cp.color AS protocol_color, cp.description AS protocol_description,
           cp.is_custom AS protocol_is_custom,
           ${SQL_DIAS_ATE_ARQUIVAR} AS days_until_archive
    FROM patients p
    LEFT JOIN agents a           ON p.assigned_agent_id = a.id
    LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
    WHERE p.id = ?
  `).bind(c.req.param('id')).first()

  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const [{ results: logs }, clinicSetting] = await Promise.all([
    // COALESCE: enquanto o agente existe, o nome atual (reflete correcao de
    // digitacao); quando ele e excluido, o snapshot gravado no contato assume.
    // `agent_removed` deixa a UI distinguir "feito por quem nao esta mais aqui"
    // de "feito pelo sistema" — sem isso, contato humano virava automatico.
    c.env.DB.prepare(`
      SELECT
        fl.*,
        COALESCE(a.name, fl.agent_name_snapshot) AS agent_name,
        (fl.agent_id IS NULL AND fl.agent_name_snapshot IS NOT NULL) AS agent_removed
      FROM followup_logs fl
      LEFT JOIN agents a ON fl.agent_id = a.id
      WHERE fl.patient_id = ?
      ORDER BY fl.contact_date DESC, fl.created_at DESC
    `).bind(patient.id).all(),
    c.env.DB.prepare(`
      SELECT value
      FROM app_settings
      WHERE key = 'clinic_name'
      LIMIT 1
    `).first(),
  ])

  const resolution = resolvePatientProtocol(patient)
  const patientOut = attachResolvedProtocol(patient, resolution)
  const today = new Date().toISOString().split('T')[0]
  const completedCount = logs.filter((log) => !log.is_extra_contact).length
  const suggestedMessage = await resolveSuggestedMessageTemplate(
    c.env.DB,
    patientOut,
    resolution,
    completedCount,
    clinicSetting?.value || 'CareDesk'
  )

  return c.json({
    ...patientOut,
    followup_urgency: calcProtocolUrgency(
      {
        ...patientOut,
        total_followups: completedCount,
      },
      resolution.days,
      today
    ),
    next_protocol_step: suggestedMessage.nextMilestone
      ? {
          day_offset: suggestedMessage.nextMilestone.day,
          date: suggestedMessage.nextMilestone.dateStr,
        }
      : null,
    suggested_message_templates: suggestedMessage.templates,
    followup_logs: logs,
  })
})

// ── POST /api/patients ────────────────────────────────────────
patients.post('/', async (c) => {
  try {
    const body = await c.req.json()

    const name        = stripHtml(body.name).slice(0, 120)
    const procedure   = stripHtml(body.procedure).slice(0, 120)
    const responsavel = stripHtml(body.responsavel).slice(0, 120)
    const notes       = body.notes != null ? stripHtml(body.notes).slice(0, 2000) : null
    const phone       = sanitizeOptionalPhone(body.phone)
    const surgery_date = /^\d{4}-\d{2}-\d{2}$/.test(body.surgery_date) ? body.surgery_date : null

    if (!name || !procedure || !surgery_date || !responsavel) {
      return c.json({ error: 'Nome, procedimento, data da cirurgia e responsável são obrigatórios' }, 400)
    }

    const cpfSanitizado = sanitizeRequiredCpf(body.cpf)
    if (!cpfSanitizado.ok) {
      return c.json({ error: 'CPF inválido' }, 400)
    }
    const cpf = cpfSanitizado.value

    const cpfExistente = await c.env.DB.prepare('SELECT id FROM patients WHERE cpf = ?').bind(cpf).first()
    if (cpfExistente) {
      return c.json({ error: 'Já existe um paciente cadastrado com este CPF' }, 409)
    }

    const emailSanitizado = sanitizeOptionalEmail(body.email)
    if (!emailSanitizado.ok) {
      return c.json({ error: 'E-mail inválido' }, 400)
    }
    const email = emailSanitizado.value

    const resolvedProtocolId = await resolveWritableProtocolId(c.env.DB, body.protocol_id)
    const id = crypto.randomUUID()
    const autor = c.get('agent')
    const createdBy = autor?.sub || null
    // Paciente sempre e atribuido a quem cadastrou — sem seletor manual no
    // formulario. Reatribuicao pra outro agente continua possivel depois via
    // PATCH, se algum dia precisar de tela pra isso.
    const assigned_agent_id = createdBy

    // Resolvida ANTES do INSERT: se o marco informado nao pertencer ao
    // protocolo, o paciente nao deve nascer meio-criado no banco.
    const backfillEntries = await resolveBackfillEntries(c.env.DB, resolvedProtocolId, surgery_date, body.backfill)

    await c.env.DB.prepare(`
      INSERT INTO patients (id, name, phone, phone_digits, email, cpf, responsavel, procedure, surgery_date, assigned_agent_id, protocol_id, notes, created_by, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name,
      phone,
      phoneDigits(phone),
      email,
      cpf,
      responsavel,
      procedure,
      surgery_date,
      assigned_agent_id,
      resolvedProtocolId,
      notes,
      createdBy,
      autor?.name ?? null
    ).run()

    if (backfillEntries.length) {
      // db.batch: ou grava todo o historico retroativo, ou nenhum — paciente
      // recem-criado nao pode ficar com progresso pela metade se algo falhar
      // no meio do lote.
      await c.env.DB.batch(backfillEntries.map((entrada) => c.env.DB.prepare(`
        INSERT INTO followup_logs (id, patient_id, agent_id, agent_name_snapshot, contact_date, contact_type, outcome, is_extra_contact, is_backfilled)
        VALUES (?, ?, ?, ?, ?, ?, 'reached', 0, 1)
      `).bind(
        crypto.randomUUID(), id, createdBy, autor?.name ?? null, entrada.contact_date, entrada.contact_type
      )))
      await ajustarContador(c.env.DB, CONTADOR_CONTATOS, backfillEntries.length)
    }

    // Backfill entra antes daqui de proposito: o marco pendente ja nasce
    // calculado com o historico retroativo somado, sem precisar de um
    // segundo recalculo depois.
    await recalcularProximoMarco(c.env.DB, id)
    // Paciente nasce 'active' e nao arquivado.
    await ajustarContador(c.env.DB, CONTADOR_PACIENTES_ATIVOS, 1)
    await ajustarContador(c.env.DB, CONTADOR_PACIENTES_TOTAL, 1)

    return c.json({
      id, name,
      phone,
      email,
      cpf,
      responsavel,
      procedure,
      surgery_date,
      assigned_agent_id,
      protocol_id:       resolvedProtocolId,
      notes,
      created_by:        createdBy,
      status:            'active',
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }, 201)
  } catch (error) {
    return writeProtocolError(c, error)
  }
})

// ── PATCH /api/patients/:id ───────────────────────────────────
patients.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const allowed = ['name','phone','email','cpf','responsavel','procedure','surgery_date','assigned_agent_id','protocol_id','status','notes']
    const fields = Object.keys(body).filter(k => allowed.includes(k))
    if (!fields.length) return c.json({ error: 'Nenhum campo válido enviado' }, 400)

    if (fields.includes('surgery_date') && !/^\d{4}-\d{2}-\d{2}$/.test(body.surgery_date)) {
      return c.json({ error: 'Data da cirurgia inválida' }, 400)
    }
    if (fields.includes('email') && !sanitizeOptionalEmail(body.email).ok) {
      return c.json({ error: 'E-mail inválido' }, 400)
    }
    if (fields.includes('cpf') && !sanitizeRequiredCpf(body.cpf).ok) {
      return c.json({ error: 'CPF inválido' }, 400)
    }
    if (fields.includes('cpf')) {
      const cpfDigitos = sanitizeRequiredCpf(body.cpf).value
      const cpfDeOutroPaciente = await c.env.DB.prepare('SELECT id FROM patients WHERE cpf = ? AND id != ?').bind(cpfDigitos, id).first()
      if (cpfDeOutroPaciente) {
        return c.json({ error: 'Já existe um paciente cadastrado com este CPF' }, 409)
      }
    }
    if (fields.includes('responsavel') && !String(body.responsavel ?? '').trim()) {
      return c.json({ error: 'Responsável é obrigatório' }, 400)
    }
    if (fields.includes('status') && !isValidPatientStatus(body.status)) {
      return c.json({ error: 'Status inválido' }, 400)
    }

    // Só interessa quando o status muda: sair de 'active' ou voltar pra ele
    // move o contador de pacientes ativos.
    const statusAnterior = fields.includes('status')
      ? (await c.env.DB.prepare('SELECT status, archived_at FROM patients WHERE id = ?').bind(id).first())
      : null

    // phone_digits acompanha phone sempre: e coluna derivada, nao entra em
    // `allowed` (o cliente nunca a envia) mas precisa ser reescrita junto, senao
    // a busca por telefone passa a apontar pro numero antigo.
    const sets = fields.map(f => `${f} = ?`).join(', ')
      + (fields.includes('phone') ? ', phone_digits = ?' : '')
    const nullable = ['phone', 'email', 'assigned_agent_id', 'protocol_id', 'notes']
    const values = await Promise.all(fields.map(async (field) => {
      if (field === 'protocol_id') {
        return resolveWritableProtocolId(c.env.DB, body[field])
      }
      if (field === 'assigned_agent_id') {
        return resolveWritableAgentId(c.env.DB, body[field])
      }
      if (field === 'name' || field === 'procedure' || field === 'responsavel') {
        return stripHtml(body[field]).slice(0, 120)
      }
      if (field === 'cpf') {
        return sanitizeRequiredCpf(body[field]).value
      }
      if (field === 'notes') {
        return body[field] === '' ? null : stripHtml(body[field]).slice(0, 2000)
      }
      if (field === 'phone') {
        return sanitizeOptionalPhone(body[field])
      }
      if (field === 'email') {
        return sanitizeOptionalEmail(body[field]).value
      }

      if (nullable.includes(field) && body[field] === '') return null
      return body[field]
    }))

    if (fields.includes('phone')) values.push(phoneDigits(body.phone))

    await c.env.DB.prepare(
      `UPDATE patients SET ${sets}, updated_at = datetime('now') WHERE id = ?`
    ).bind(...values, id).run()

    // surgery_date, protocol_id e status mudam o proximo marco. Recalcular
    // sempre e mais barato que errar: e uma consulta indexada por id.
    await recalcularProximoMarco(c.env.DB, id)

    if (statusAnterior) {
      const eraAtivo = contaComoAtivo(statusAnterior)
      const ficouAtivo = contaComoAtivo({ status: body.status, archived_at: statusAnterior.archived_at })
      if (eraAtivo !== ficouAtivo) {
        await ajustarContador(c.env.DB, CONTADOR_PACIENTES_ATIVOS, ficouAtivo ? 1 : -1)
      }
    }

    const updated = await c.env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(id).first()
    return c.json(updated)
  } catch (error) {
    return writeProtocolError(c, error)
  }
})

// ── DELETE /api/patients/:id (admin only) ─────────────────────
patients.delete('/:id', adminOnly, async (c) => {
  const id = c.req.param('id')

  // Verificar se paciente tem protocolo customizado (is_custom=1) para limpar depois
  const row = await c.env.DB.prepare(
    `SELECT p.protocol_id, p.status, p.archived_at, cp.is_custom,
       (SELECT COUNT(*) FROM followup_logs WHERE patient_id = p.id) AS total_contatos
     FROM patients p
     LEFT JOIN contact_protocols cp ON p.protocol_id = cp.id
     WHERE p.id = ?`
  ).bind(id).first()

  // Deletar paciente — cascades: followup_logs, notifications
  await c.env.DB.prepare('DELETE FROM patients WHERE id = ?').bind(id).run()

  if (contaComoAtivo(row)) {
    await ajustarContador(c.env.DB, CONTADOR_PACIENTES_ATIVOS, -1)
  }
  await ajustarContador(c.env.DB, CONTADOR_PACIENTES_TOTAL, -1)
  // O CASCADE acima apaga os followup_logs do paciente junto — sem isso o
  // contador materializado de contatos ficava inflado ate a reconciliacao
  // noturna corrigir.
  if (row?.total_contatos) {
    await ajustarContador(c.env.DB, CONTADOR_CONTATOS, -row.total_contatos)
  }

  // Limpar protocolo customizado orphan (só existe para esse paciente)
  if (row?.protocol_id && row?.is_custom === 1) {
    await c.env.DB.prepare('DELETE FROM contact_protocols WHERE id = ? AND is_custom = 1').bind(row.protocol_id).run()
  }

  return c.json({ success: true })
})

// ── GET /api/patients/:id/documents ───────────────────────────
// Catálogo inteiro com LEFT JOIN na atribuição desse paciente, pra a UI
// renderizar o checklist completo (marcado/desmarcado + status) numa
// unica chamada.
patients.get('/:id/documents', async (c) => {
  const patientId = c.req.param('id')
  const patient = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ?').bind(patientId).first()
  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const { results } = await c.env.DB.prepare(`
    SELECT dt.id AS document_template_id, dt.name, dt.category, dt.description, pd.status
    FROM document_templates dt
    LEFT JOIN patient_documents pd
      ON pd.document_template_id = dt.id AND pd.patient_id = ?
    ORDER BY dt.category ASC, dt.created_at ASC
  `).bind(patientId).all()

  return c.json(results.map((row) => ({
    document_template_id: row.document_template_id,
    name: row.name,
    category: row.category,
    description: row.description,
    assigned: row.status !== null,
    status: row.status,
  })))
})

// ── PUT /api/patients/:id/documents/:templateId ───────────────
// Atribui (marca a caixa). Upsert idempotente — marcar de novo so atualiza.
patients.put('/:id/documents/:templateId', async (c) => {
  const patientId = c.req.param('id')
  const templateId = c.req.param('templateId')

  const patient = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ?').bind(patientId).first()
  if (!patient) return c.json({ error: 'Paciente não encontrado' }, 404)

  const template = await c.env.DB.prepare('SELECT id FROM document_templates WHERE id = ?').bind(templateId).first()
  if (!template) return c.json({ error: 'Documento não encontrado' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const status = isValidDocumentStatus(body.status) ? body.status : 'pending'

  await c.env.DB.prepare(`
    INSERT INTO patient_documents (id, patient_id, document_template_id, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(patient_id, document_template_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')
  `).bind(crypto.randomUUID(), patientId, templateId, status).run()

  return c.json({ document_template_id: templateId, assigned: true, status })
})

// ── PATCH /api/patients/:id/documents/:templateId ─────────────
// So alterna o status (pendente/feito) de um documento ja atribuido.
patients.patch('/:id/documents/:templateId', async (c) => {
  const patientId = c.req.param('id')
  const templateId = c.req.param('templateId')
  const body = await c.req.json()

  if (!isValidDocumentStatus(body.status)) {
    return c.json({ error: 'Status inválido. Use "pending" ou "done"' }, 400)
  }

  const result = await c.env.DB.prepare(`
    UPDATE patient_documents SET status = ?, updated_at = datetime('now')
    WHERE patient_id = ? AND document_template_id = ?
  `).bind(body.status, patientId, templateId).run()

  if (!result.meta.changes) return c.json({ error: 'Documento não atribuído a este paciente' }, 404)

  return c.json({ document_template_id: templateId, assigned: true, status: body.status })
})

// ── DELETE /api/patients/:id/documents/:templateId ────────────
// Desatribui (desmarca a caixa).
patients.delete('/:id/documents/:templateId', async (c) => {
  const patientId = c.req.param('id')
  const templateId = c.req.param('templateId')

  await c.env.DB.prepare(
    'DELETE FROM patient_documents WHERE patient_id = ? AND document_template_id = ?'
  ).bind(patientId, templateId).run()

  return c.json({ success: true })
})

export default patients

function stripHtml(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/<[^>]*>/g, '').trim()
}

async function resolveWritableAgentId(db, requestedAgentId) {
  const normalized = typeof requestedAgentId === 'string' ? requestedAgentId.trim() : requestedAgentId
  if (!normalized) return null

  const agent = await db.prepare('SELECT id FROM agents WHERE id = ? LIMIT 1').bind(normalized).first()
  if (!agent) {
    const error = new Error('AGENT_NOT_FOUND')
    error.status = 400
    throw error
  }
  return agent.id
}

async function resolveWritableProtocolId(db, requestedProtocolId) {
  const normalized = typeof requestedProtocolId === 'string'
    ? requestedProtocolId.trim()
    : requestedProtocolId

  if (normalized) {
    const protocol = await db.prepare('SELECT id FROM contact_protocols WHERE id = ? LIMIT 1').bind(normalized).first()
    if (!protocol) {
      const error = new Error('PROTOCOL_NOT_FOUND')
      error.status = 400
      throw error
    }
    return protocol.id
  }

  const fallback = await db.prepare(`
    SELECT id
    FROM contact_protocols
    WHERE is_default = 1
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).first()

  return fallback?.id || null
}

// Cadastro retroativo: paciente que ja estava em acompanhamento fora do
// sistema. `last_completed_day_offset` marca ATE QUAL marco (inclusive) ja foi
// contatado — o prefixo contiguo da lista ordenada de dias do protocolo, nunca
// uma lista arbitraria vinda do cliente. E o que garante que o progresso
// calculado por CONTAGEM de followup_logs (ver getNextPendingMilestone) bata
// com o marco que o operador de fato escolheu.
async function resolveBackfillEntries(db, protocolId, surgeryDate, backfill) {
  if (!backfill || backfill.last_completed_day_offset == null || !protocolId) return []

  const protocolo = await db.prepare('SELECT days FROM contact_protocols WHERE id = ?').bind(protocolId).first()
  const protocolDays = parseProtocolDays(protocolo?.days)
  const cutIndex = protocolDays.indexOf(Number(backfill.last_completed_day_offset))

  if (cutIndex === -1) {
    const error = new Error('BACKFILL_DAY_NOT_IN_PROTOCOL')
    error.status = 400
    throw error
  }

  const diasCobertos = protocolDays.slice(0, cutIndex + 1)
  const marcos = buildProtocolMilestones(surgeryDate, diasCobertos)
  const hoje = new Date().toISOString().split('T')[0]
  const tipoDeContato = isValidMessageTemplateContactType(backfill.contact_type) ? backfill.contact_type : 'call'
  const datasInformadas = backfill.dates && typeof backfill.dates === 'object' ? backfill.dates : {}

  return marcos.map((marco) => {
    const dataInformada = datasInformadas[String(marco.day)]
    const contactDate = /^\d{4}-\d{2}-\d{2}$/.test(dataInformada) ? dataInformada : marco.dateStr

    if (contactDate > hoje) {
      const error = new Error('BACKFILL_DATE_IN_FUTURE')
      error.status = 400
      throw error
    }

    return { contact_date: contactDate, contact_type: tipoDeContato }
  })
}

function writeProtocolError(c, error) {
  if (error?.message === 'PROTOCOL_NOT_FOUND') {
    return c.json({ error: 'Protocolo informado não existe' }, error.status || 400)
  }
  if (error?.message === 'AGENT_NOT_FOUND') {
    return c.json({ error: 'Agente informado não existe' }, error.status || 400)
  }
  if (error?.message === 'BACKFILL_DAY_NOT_IN_PROTOCOL') {
    return c.json({ error: 'O marco informado como último contato não pertence ao protocolo selecionado' }, error.status || 400)
  }
  if (error?.message === 'BACKFILL_DATE_IN_FUTURE') {
    return c.json({ error: 'A data de um contato retroativo não pode ser futura' }, error.status || 400)
  }

  throw error
}
