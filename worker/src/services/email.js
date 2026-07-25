// Unico ponto de saida de e-mail do sistema.
//
// Transporte: Google Apps Script publicado como Web App na conta Google da
// clinica (ver docs/EMAIL-APPS-SCRIPT.md). O Worker nao consegue falar SMTP —
// a Cloudflare bloqueia saida SMTP —, entao o envio vai por HTTP e o Apps
// Script chama MailApp.sendEmail() do lado do Google. Remetente e o proprio
// Gmail da conta que publicou o script.
//
// Trocar de transporte (Resend, Gmail API) e reescrever sendEmail(); o fluxo de
// reset nao precisa saber quem entrega.

// LIMITACAO: conta Gmail gratuita entrega ~100 destinatarios/dia. O uso previsto
// e reset de senha (poucos por dia), entao a cota nao foi tratada em codigo.
export async function sendEmail(env, { to, subject, html }) {
  const url = env.EMAIL_RELAY_URL
  const token = env.EMAIL_RELAY_TOKEN

  if (!url || !token) {
    throw new Error('Envio de e-mail nao configurado (EMAIL_RELAY_URL / EMAIL_RELAY_TOKEN ausentes)')
  }

  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // O token vai no corpo, nao em header: o Apps Script redireciona a chamada
    // internamente e headers customizados se perdem no redirect.
    body: JSON.stringify({ token, to, subject, html }),
  })

  // Apps Script responde 200 com corpo de erro em varias falhas — status sozinho
  // nao serve como confirmacao.
  const corpo = await resposta.text()
  let resultado
  try {
    resultado = JSON.parse(corpo)
  } catch {
    throw new Error(`Resposta inesperada do relay de e-mail: ${corpo.slice(0, 200)}`)
  }

  if (!resposta.ok || !resultado.ok) {
    throw new Error(`Falha no envio de e-mail: ${resultado.error ?? resposta.status}`)
  }

  return resultado
}

// ── Conteudo do e-mail de reset ───────────────────────────────
export function buildResetCodeEmail({ nomeDoAgente, codigo, minutosDeValidade, nomeDoSistema = 'CareDesk' }) {
  const saudacao = nomeDoAgente ? `Olá, ${nomeDoAgente}.` : 'Olá.'

  return {
    subject: `${nomeDoSistema} — código para redefinir sua senha`,
    html: `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1c1b1f; line-height: 1.6;">
        <p>${saudacao}</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta no ${nomeDoSistema}. Use o código abaixo:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0; color: #18352d;">${codigo}</p>
        <p>O código vale por ${minutosDeValidade} minutos e só pode ser usado uma vez.</p>
        <p style="color: #6b6b6b;">Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.</p>
      </div>
    `.trim(),
  }
}
