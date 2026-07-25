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

import { resolveEmailConfig } from '../utils/messagingSettings.js'
import { loadEmailTemplate, renderEmailTemplate } from '../utils/emailTemplates.js'

// LIMITACAO: conta Gmail gratuita entrega ~100 destinatarios/dia. O uso previsto
// e reset de senha (poucos por dia), entao a cota nao foi tratada em codigo.
export async function sendEmail(env, { to, subject, html }) {
  const config = await resolveEmailConfig(env)

  if (!config.enabled) {
    throw new Error('Envio de e-mail desativado nas configuracoes de mensageria')
  }
  if (!config.url || !config.token) {
    throw new Error('Envio de e-mail nao configurado (URL do relay ou token ausente)')
  }

  const { url, token } = config

  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // O token vai no corpo, nao em header: o Apps Script redireciona a chamada
    // internamente e headers customizados se perdem no redirect.
    body: JSON.stringify({ token, to, subject, html, fromName: config.fromName }),
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
// Le o template editavel do banco. Se a linha sumir (banco novo antes da
// migration, por exemplo), cai num texto minimo em vez de deixar alguem sem
// conseguir recuperar a senha — falhar aqui e pior que enviar sem formatacao.
export async function buildResetCodeEmail(env, { nomeDoAgente, codigo, minutosDeValidade, nomeDaClinica = 'CareDesk' }) {
  const contexto = {
    agent_name: nomeDoAgente || 'equipe',
    code: codigo,
    expires_in_minutes: minutosDeValidade,
    clinic_name: nomeDaClinica,
  }

  const template = await loadEmailTemplate(env.DB, 'password_reset')
  if (!template) {
    console.warn('[email] template password_reset ausente; usando fallback minimo')
    return {
      subject: `${nomeDaClinica} — código para redefinir sua senha`,
      html: `<p>Seu código é <strong>${codigo}</strong>. Ele vale por ${minutosDeValidade} minutos.</p>`,
    }
  }

  return renderEmailTemplate(template, contexto)
}
