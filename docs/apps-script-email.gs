/**
 * Ponte de envio de e-mail do CareDesk.
 *
 * Cloudflare Workers nao consegue abrir conexao SMTP (bloqueio antispam da
 * propria Cloudflare), entao o Worker chama este script por HTTP e quem envia
 * de fato e o Gmail da conta Google que publicou o Web App.
 *
 * Passo a passo de publicacao: docs/EMAIL-APPS-SCRIPT.md
 */

// Mesmo valor configurado no Worker como secret EMAIL_RELAY_TOKEN.
// Defina em Project Settings > Script Properties, com a chave RELAY_TOKEN.
// Nao escreva o token aqui no codigo.
function getRelayToken() {
  return PropertiesService.getScriptProperties().getProperty('RELAY_TOKEN');
}

function doPost(e) {
  try {
    var corpo = JSON.parse(e.postData.contents);
    var tokenEsperado = getRelayToken();

    // O Web App precisa ser publicado com acesso "qualquer pessoa" pro Worker
    // alcancar a URL sem login Google. O token e a unica barreira contra alguem
    // que descubra a URL e tente usar a conta como relay de spam.
    if (!tokenEsperado || corpo.token !== tokenEsperado) {
      return responder({ ok: false, error: 'unauthorized' });
    }

    if (!corpo.to || !corpo.subject || !corpo.html) {
      return responder({ ok: false, error: 'missing_fields' });
    }

    MailApp.sendEmail({
      to: corpo.to,
      subject: corpo.subject,
      htmlBody: corpo.html,
      // Nome de exibicao do remetente, configuravel na aba Mensageria do painel.
      name: corpo.fromName || 'CareDesk',
    });

    // Cota restante do dia — util pra diagnosticar entrega que parou de sair.
    return responder({ ok: true, remainingQuota: MailApp.getRemainingDailyQuota() });
  } catch (erro) {
    return responder({ ok: false, error: String(erro) });
  }
}

// Apps Script devolve 200 mesmo em erro de aplicacao; o Worker decide pelo
// campo `ok` do corpo, nao pelo status HTTP.
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
