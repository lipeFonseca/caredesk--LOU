// Campos de contato opcionais compartilhados por pacientes e agentes.
// Vazio e ausente viram null: a coluna e opcional e string vazia no banco so
// atrapalha depois (`WHERE email IS NOT NULL` deixaria de funcionar).

const MAX_PHONE_LENGTH = 20
const MAX_EMAIL_LENGTH = 160

// Aceita o que uma pessoa realmente digita num telefone: digitos, +, parenteses,
// espaco e hifen. O resto sai fora.
export function sanitizeOptionalPhone(valor) {
  if (valor == null || valor === '') return null

  const limpo = String(valor).replace(/[^\d+()\s-]/g, '').trim().slice(0, MAX_PHONE_LENGTH)
  return limpo || null
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
