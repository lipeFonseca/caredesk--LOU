// Importacao de pacientes em massa via CSV — reusa a mesma validacao que
// POST /api/patients ja aplica linha a linha (worker/src/routes/patients.js),
// so que tudo-ou-nada: qualquer linha invalida cancela o lote inteiro antes de
// qualquer INSERT rodar. Nunca nasce paciente "meio importado".

import { sanitizeOptionalPhone, sanitizeOptionalEmail, sanitizeRequiredCpf, phoneDigits, stripHtml } from '../utils/contactFields.js'
import { ehMenorDeIdade } from '../utils/patientAge.js'
import { recalcularLote } from '../utils/proximoMarco.js'
import { ajustarContador, CONTADOR_PACIENTES_ATIVOS, CONTADOR_PACIENTES_TOTAL } from '../utils/contadores.js'

export const MAX_LINHAS_POR_IMPORTACAO = 500

// D1 limita a 100 parametros vinculados por statement — uma unica query
// `IN (...)` com 500 CPFs estouraria isso. Consulta em lotes.
const TAMANHO_LOTE_CONSULTA_CPF = 100

function isoDataValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

// Mesma regra de campo obrigatorio/formato que POST /api/patients aplica —
// so que devolve erro em vez de lancar, pra acumular por linha.
function validarCamposDaLinha(linhaBruta) {
  const erros = []

  const name = stripHtml(String(linhaBruta.name ?? '')).slice(0, 120)
  const procedure = stripHtml(String(linhaBruta.procedure ?? '')).slice(0, 120)
  const surgery_date = isoDataValida(linhaBruta.surgery_date)
  const data_nascimento = isoDataValida(linhaBruta.data_nascimento)
  const responsavel = linhaBruta.responsavel != null ? stripHtml(String(linhaBruta.responsavel)).slice(0, 120) : ''

  if (!name) erros.push('Nome é obrigatório')
  if (!procedure) erros.push('Procedimento é obrigatório')
  if (!surgery_date) erros.push('Data da cirurgia inválida ou ausente (use aaaa-mm-dd)')
  if (!data_nascimento) erros.push('Data de nascimento inválida ou ausente (use aaaa-mm-dd)')

  // So obrigatorio pra menor de idade — maior pode nao ter (ou nao precisar
  // informar) um responsavel. Mesma regra de worker/src/utils/patientAge.js
  // ja usada no cadastro individual.
  if (data_nascimento && ehMenorDeIdade(data_nascimento) && !responsavel) {
    erros.push('Responsável é obrigatório para paciente menor de idade')
  }

  const cpfSanitizado = sanitizeRequiredCpf(linhaBruta.cpf)
  if (!cpfSanitizado.ok) erros.push('CPF inválido')

  const emailSanitizado = sanitizeOptionalEmail(linhaBruta.email)
  if (!emailSanitizado.ok) erros.push('E-mail inválido')

  if (erros.length) return { paciente: null, erros }

  return {
    erros: [],
    paciente: {
      name,
      procedure,
      surgery_date,
      data_nascimento,
      responsavel: responsavel || null,
      cpf: cpfSanitizado.value,
      email: emailSanitizado.value,
      phone: sanitizeOptionalPhone(linhaBruta.phone),
    },
  }
}

async function buscarCpfsExistentes(db, cpfs) {
  const encontrados = new Set()
  for (let i = 0; i < cpfs.length; i += TAMANHO_LOTE_CONSULTA_CPF) {
    const lote = cpfs.slice(i, i + TAMANHO_LOTE_CONSULTA_CPF)
    const marcadores = lote.map(() => '?').join(',')
    const { results } = await db.prepare(`SELECT cpf FROM patients WHERE cpf IN (${marcadores})`).bind(...lote).all()
    for (const linha of results ?? []) encontrados.add(linha.cpf)
  }
  return encontrados
}

async function contarPacientesPorCpf(db, cpfs) {
  let total = 0
  for (let i = 0; i < cpfs.length; i += TAMANHO_LOTE_CONSULTA_CPF) {
    const lote = cpfs.slice(i, i + TAMANHO_LOTE_CONSULTA_CPF)
    const marcadores = lote.map(() => '?').join(',')
    const linha = await db.prepare(`SELECT COUNT(*) AS total FROM patients WHERE cpf IN (${marcadores})`).bind(...lote).first()
    total += linha?.total ?? 0
  }
  return total
}

// `rows`: array de objetos já mapeados pelas colunas do CSV (name, cpf,
// data_nascimento, procedure, surgery_date, responsavel?, phone?, email?).
// `protocolId`: já resolvido (worker/src/routes/patients.js:629,
// resolveWritableProtocolId) antes de chamar isto — o service não decide
// protocolo, só usa o que a rota já validou.
// `actor`: { sub, name } do agente autenticado fazendo a importação.
export async function importPatients(db, { rows, protocolId, actor }) {
  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, totalRows: 0, rowErrors: [{ row: 0, errors: ['Nenhuma linha encontrada no arquivo'] }] }
  }
  if (rows.length > MAX_LINHAS_POR_IMPORTACAO) {
    return {
      ok: false,
      totalRows: rows.length,
      rowErrors: [{ row: 0, errors: [`Máximo de ${MAX_LINHAS_POR_IMPORTACAO} linhas por importação — divida em arquivos menores`] }],
    }
  }

  const errosPorLinha = new Map()
  const pacientesPorLinha = new Map()

  // Linha 1 do arquivo é o cabeçalho — a primeira linha de dado é a 2, pra o
  // relatório de erro apontar exatamente a linha que o usuário vê no Excel.
  rows.forEach((linhaBruta, indice) => {
    const row = indice + 2
    const { paciente, erros } = validarCamposDaLinha(linhaBruta)
    if (erros.length) errosPorLinha.set(row, erros)
    else pacientesPorLinha.set(row, paciente)
  })

  // CPF duplicado dentro do proprio arquivo — so entre linhas que ja passaram
  // na validacao de campo (uma linha com CPF invalido nao entra aqui).
  const linhasPorCpf = new Map()
  for (const [row, paciente] of pacientesPorLinha) {
    if (!linhasPorCpf.has(paciente.cpf)) linhasPorCpf.set(paciente.cpf, [])
    linhasPorCpf.get(paciente.cpf).push(row)
  }
  for (const linhas of linhasPorCpf.values()) {
    if (linhas.length <= 1) continue
    for (const row of linhas) {
      const outras = linhas.filter((l) => l !== row).join(', ')
      errosPorLinha.set(row, [`CPF duplicado nesta planilha (também aparece na linha ${outras})`])
      pacientesPorLinha.delete(row)
    }
  }

  // CPF ja existente no banco — so pros que sobreviveram ate aqui.
  const cpfsRestantes = Array.from(pacientesPorLinha.values(), (p) => p.cpf)
  const cpfsExistentes = cpfsRestantes.length ? await buscarCpfsExistentes(db, cpfsRestantes) : new Set()
  if (cpfsExistentes.size) {
    for (const [row, paciente] of pacientesPorLinha) {
      if (cpfsExistentes.has(paciente.cpf)) {
        errosPorLinha.set(row, ['Já existe um paciente cadastrado com este CPF'])
        pacientesPorLinha.delete(row)
      }
    }
  }

  if (errosPorLinha.size) {
    const rowErrors = Array.from(errosPorLinha.entries())
      .sort(([a], [b]) => a - b)
      .map(([row, errors]) => ({ row, errors }))
    return { ok: false, totalRows: rows.length, rowErrors }
  }

  // Tudo validado — INSERT de cada linha num unico db.batch (atomico: ou tudo
  // entra, ou nada entra, mesmo padrao ja usado no backfill individual).
  const linhasOrdenadas = Array.from(pacientesPorLinha.entries()).sort(([a], [b]) => a - b)
  const idsGerados = []

  const statements = linhasOrdenadas.map(([, paciente]) => {
    const id = crypto.randomUUID()
    idsGerados.push(id)
    return db.prepare(`
      INSERT INTO patients (id, name, phone, phone_digits, email, cpf, responsavel, data_nascimento, procedure, surgery_date, assigned_agent_id, protocol_id, created_by, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      paciente.name,
      paciente.phone,
      phoneDigits(paciente.phone),
      paciente.email,
      paciente.cpf,
      paciente.responsavel,
      paciente.data_nascimento,
      paciente.procedure,
      paciente.surgery_date,
      actor.sub,
      protocolId,
      actor.sub,
      actor.name ?? null
    )
  })

  await db.batch(statements)

  await recalcularLote(db, idsGerados)
  await ajustarContador(db, CONTADOR_PACIENTES_ATIVOS, idsGerados.length)
  await ajustarContador(db, CONTADOR_PACIENTES_TOTAL, idsGerados.length)

  // Confirmacao pos-batch: nunca confiar so no db.batch ter "rodado sem
  // erro" — reconta de verdade os CPFs que acabaram de entrar antes de
  // devolver sucesso pro usuario. E o "monitor" pedido explicitamente: se
  // o numero nao bater exato, reporta divergencia em vez de mentir sucesso.
  const cpfsInseridos = linhasOrdenadas.map(([, p]) => p.cpf)
  const confirmados = await contarPacientesPorCpf(db, cpfsInseridos)

  if (confirmados !== idsGerados.length) {
    return {
      ok: false,
      totalRows: rows.length,
      rowErrors: [{
        row: 0,
        errors: [`Divergência na confirmação: ${idsGerados.length} inseridos, ${confirmados} confirmados no banco. Verifique manualmente antes de importar de novo.`],
      }],
    }
  }

  return { ok: true, totalRows: rows.length, imported: idsGerados.length }
}
