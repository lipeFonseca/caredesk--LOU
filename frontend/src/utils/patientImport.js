import Papa from 'papaparse'
import { calcularIdade } from './contactDisplay'

// Cabecalho do CSV = nome da coluna no banco, exatamente — sem sinonimo, sem
// traducao. Decisao do usuario: ele edita a planilha pra bater com isto, o
// sistema nao tenta adivinhar "Nome completo" vs `name`.
export const IMPORT_COLUMNS = [
  { key: 'name',            label: 'name',            obrigatorio: true },
  { key: 'cpf',              label: 'cpf',              obrigatorio: true },
  { key: 'data_nascimento',  label: 'data_nascimento',  obrigatorio: true },
  { key: 'procedure',        label: 'procedure',        obrigatorio: true },
  { key: 'surgery_date',     label: 'surgery_date',     obrigatorio: true },
  { key: 'responsavel',      label: 'responsavel',      obrigatorio: false },
  { key: 'phone',            label: 'phone',            obrigatorio: false },
  { key: 'email',            label: 'email',            obrigatorio: false },
]

export function parseCsv(texto) {
  const resultado = Papa.parse(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return { data: resultado.data ?? [], errosDeParse: resultado.errors ?? [] }
}

// Aceita "aaaa-mm-dd" (ja ISO) ou "dd/mm/aaaa" — sempre por split de string,
// nunca via `Date`/`toISOString()`. `toISOString()` converte pra UTC e erraria
// o dia no fuso do Brasil (mesmo cuidado que worker/src/utils/patientAge.js
// e o calcularIdade abaixo ja tomam do lado do backend).
export function paraIsoData(valor) {
  const texto = String(valor ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto
  const partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!partes) return null
  const [, dia, mes, ano] = partes
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
}

// Mesmo algoritmo de worker/src/utils/contactFields.js (sanitizeRequiredCpf)
// — duplicado de proposito, front e back rodam em runtimes separados nesse
// projeto (mesmo padrao ja usado em calcularIdade/ehMenorDeIdade). So-dígitos
// na saida; mascara e problema de exibicao (formatCpf), nao de validacao.
export function cpfValido(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  if (digitos.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false

  const calcularDigitoVerificador = (base) => {
    let soma = 0
    let peso = base.length + 1
    for (const digito of base) {
      soma += Number(digito) * peso
      peso -= 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const dv1 = calcularDigitoVerificador(digitos.slice(0, 9))
  const dv2 = calcularDigitoVerificador(digitos.slice(0, 9) + String(dv1))

  return digitos.slice(9) === `${dv1}${dv2}`
}

function cpfSoDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

// Prevalida no navegador (feedback rapido, antes de gastar uma chamada de
// rede) — a existencia no banco (CPF duplicado, protocolo) so o servidor
// sabe, o relatorio de erro dele complementa isto depois do envio.
// `registrosCsv`: saida de `parseCsv(...).data`, um objeto por linha, chaves
// = cabecalho do arquivo. Preserva o numero de linha ORIGINAL (cabecalho é a
// linha 1) pra apontar a linha certa no Excel do usuario.
export function linhasParaPacientes(registrosCsv) {
  const linhas = registrosCsv.map((registro, indice) => {
    const row = indice + 2
    const erros = []

    const name = String(registro.name ?? '').trim()
    const procedure = String(registro.procedure ?? '').trim()
    const surgery_date = paraIsoData(registro.surgery_date)
    const data_nascimento = paraIsoData(registro.data_nascimento)
    const responsavel = String(registro.responsavel ?? '').trim()
    const cpfDigitos = cpfSoDigitos(registro.cpf)

    // Linha 100% vazia (formatacao sobrando do Excel) e pulada em silencio;
    // parcialmente preenchida vira erro normal — nunca pulada, senao
    // mascararia um paciente que o usuario queria mesmo importar.
    const camposPreenchidos = [name, procedure, surgery_date, data_nascimento, cpfDigitos].some(Boolean)
    if (!camposPreenchidos) return null

    if (!name) erros.push('Nome é obrigatório')
    if (!procedure) erros.push('Procedimento é obrigatório')
    if (!surgery_date) erros.push('Data da cirurgia inválida ou ausente')
    if (!data_nascimento) erros.push('Data de nascimento inválida ou ausente')
    if (!cpfValido(registro.cpf)) erros.push('CPF inválido')

    const idade = data_nascimento ? calcularIdade(data_nascimento) : null
    const menorDeIdade = idade != null && idade < 18
    if (menorDeIdade && !responsavel) erros.push('Responsável é obrigatório para paciente menor de idade')

    const email = String(registro.email ?? '').trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push('E-mail inválido')

    return {
      row,
      erros,
      paciente: {
        name,
        cpf: cpfDigitos,
        data_nascimento,
        procedure,
        surgery_date,
        responsavel: responsavel || undefined,
        phone: String(registro.phone ?? '').trim() || undefined,
        email: email || undefined,
      },
    }
  }).filter(Boolean)

  // CPF duplicado dentro do proprio arquivo — so entre linhas ja sem erro de
  // campo (uma linha com CPF invalido nao entra nessa checagem).
  const linhasPorCpf = new Map()
  for (const linha of linhas) {
    if (linha.erros.length) continue
    if (!linhasPorCpf.has(linha.paciente.cpf)) linhasPorCpf.set(linha.paciente.cpf, [])
    linhasPorCpf.get(linha.paciente.cpf).push(linha)
  }
  for (const grupo of linhasPorCpf.values()) {
    if (grupo.length <= 1) continue
    for (const linha of grupo) {
      const outras = grupo.filter((l) => l !== linha).map((l) => l.row).join(', ')
      linha.erros.push(`CPF duplicado nesta planilha (também aparece na linha ${outras})`)
    }
  }

  return linhas
}
