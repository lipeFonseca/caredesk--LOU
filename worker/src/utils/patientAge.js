// Idade nunca e guardada como numero: fica errada com a passagem do tempo
// (mesmo motivo de `next_followup_date` ser materializada mas urgencia nao
// ser — o que muda sozinho com o calendario e sempre calculado na leitura,
// nunca gravado como valor fixo). Aqui a fonte de verdade e data_nascimento.

export function calcularIdade(dataNascimentoIso, referenciaIso = new Date().toISOString().slice(0, 10)) {
  const [anoNasc, mesNasc, diaNasc] = dataNascimentoIso.split('-').map(Number)
  const [anoRef, mesRef, diaRef] = referenciaIso.split('-').map(Number)

  let idade = anoRef - anoNasc
  if (mesRef < mesNasc || (mesRef === mesNasc && diaRef < diaNasc)) idade -= 1

  return idade
}

export function ehMenorDeIdade(dataNascimentoIso, referenciaIso) {
  return calcularIdade(dataNascimentoIso, referenciaIso) < 18
}
