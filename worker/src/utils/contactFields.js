// Campos de contato opcionais compartilhados por pacientes e agentes.
// Vazio e ausente viram null: a coluna e opcional e string vazia no banco so
// atrapalha depois (`WHERE email IS NOT NULL` deixaria de funcionar).

const MAX_PHONE_LENGTH = 20
const MAX_EMAIL_LENGTH = 160
const CPF_LENGTH = 11

// Aceita o que uma pessoa realmente digita num telefone: digitos, +, parenteses,
// espaco e hifen. O resto sai fora.
export function sanitizeOptionalPhone(valor) {
  if (valor == null || valor === '') return null

  const limpo = String(valor).replace(/[^\d+()\s-]/g, '').trim().slice(0, MAX_PHONE_LENGTH)
  return limpo || null
}

// E-mail de agente e OBRIGATORIO e precisa ser endereco real: e a credencial de
// login E o destino do resumo diario e da redefinicao de senha. O admin default
// nasceu como "admin" (sem @) e isso custou uma sessao inteira de diagnostico —
// o sistema reportava envio bem-sucedido enquanto ninguem recebia nada.
export function validateAgentEmail(valor) {
  const limpo = typeof valor === 'string' ? valor.trim().toLowerCase() : ''

  if (!limpo) return { error: 'Informe o e-mail do agente', status: 400 }
  if (limpo.length > 160) return { error: 'E-mail muito longo', status: 400 }
  if (!limpo.includes('@')) {
    return { error: 'O e-mail do agente precisa ser um endereço real — é por ele que chegam a redefinição de senha e o resumo diário', status: 400 }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) {
    return { error: 'E-mail inválido', status: 400 }
  }

  return { value: limpo }
}

// Versao so-digitos, gravada em `patients.phone_digits`. Existe pra busca por
// telefone poder usar prefixo (`LIKE '8598%'`), que usa indice — o formato
// exibido tem pontuacao e mataria essa possibilidade.
export function phoneDigits(valor) {
  if (valor == null || valor === '') return null
  const digitos = String(valor).replace(/\D/g, '')
  return digitos || null
}

// Validacao proposital de "formato plausivel", nao de e-mail existente: aqui o
// e-mail e so contato, nunca credencial nem destino de envio automatico. Regra
// mais dura rejeitaria endereco valido e daria trabalho a quem cadastra.
export function sanitizeOptionalEmail(valor) {
  if (valor == null || valor === '') return { ok: true, value: null }

  const limpo = String(valor).trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH)
  if (!limpo) return { ok: true, value: null }

  const plausivel = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)
  return plausivel ? { ok: true, value: limpo } : { ok: false, value: null }
}

// CPF e obrigatorio no cadastro — e a chave real de identificacao do paciente
// (protocol_id nao serve pra isso, e so o vinculo com o protocolo de contato).
// Guardado so-digitos (mesma logica de phoneDigits): mascara e problema de
// exibicao, nao de armazenamento. Valida o digito verificador de verdade —
// sequencias falsas como 111.111.111-11 sao rejeitadas antes de chegar ao banco.
export function sanitizeRequiredCpf(valor) {
  const digitos = valor == null ? '' : String(valor).replace(/\D/g, '')
  if (digitos.length !== CPF_LENGTH) return { ok: false, value: null }
  if (/^(\d)\1{10}$/.test(digitos)) return { ok: false, value: null }

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

  return digitos.slice(9) === `${dv1}${dv2}` ? { ok: true, value: digitos } : { ok: false, value: null }
}
