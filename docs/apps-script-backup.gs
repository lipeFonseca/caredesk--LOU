/**
 * Ponte de backup do CareDesk para Google Planilhas.
 *
 * Mesmo motivo da ponte de e-mail (docs/apps-script-email.gs): o Worker nao
 * fala a API do Google Sheets diretamente (exigiria OAuth2/service account),
 * entao ele manda os dados por HTTP e quem escreve na planilha de fato e este
 * script, rodando na conta Google dona do backup.
 *
 * Publicado como Web App SEPARADO do relay de e-mail — token e planilha
 * proprios, de proposito (ver docs/GOOGLE-SHEETS-BACKUP.md). Nao e uma
 * extensao do script de e-mail: sao duas contas/credenciais independentes,
 * pra um token vazado ou uma conta comprometida nao derrubar as duas coisas
 * juntas.
 *
 * Passo a passo de publicacao: docs/GOOGLE-SHEETS-BACKUP.md
 */

// Mesmo valor configurado no Worker como backup_relay_token (aba Backup, em
// Configuracoes). Defina em Project Settings > Script Properties, chave
// RELAY_TOKEN. Nao escreva o token aqui no codigo.
function getRelayToken() {
  return PropertiesService.getScriptProperties().getProperty('RELAY_TOKEN');
}

// ID da planilha de destino (da URL dela: .../spreadsheets/d/<ID>/edit).
// Defina em Project Settings > Script Properties, chave SPREADSHEET_ID.
function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return SpreadsheetApp.openById(id);
}

function doPost(e) {
  try {
    var corpo = JSON.parse(e.postData.contents);
    var tokenEsperado = getRelayToken();

    // Mesma barreira do relay de e-mail: token no corpo (nao em header, que se
    // perde no redirect interno do Apps Script), unica coisa que impede
    // alguem com a URL de ler ou sujar a planilha de backup.
    if (!tokenEsperado || corpo.token !== tokenEsperado) {
      return responder({ ok: false, error: 'unauthorized' });
    }

    switch (corpo.action) {
      case 'backup_agents':
      case 'backup_protocols':
      case 'backup_patients':
      case 'backup_followups':
        return responder(gravarLote(corpo));
      case 'export_for_restore':
        return responder(exportarParaRestore());
      default:
        return responder({ ok: false, error: 'unknown_action' });
    }
  } catch (erro) {
    return responder({ ok: false, error: String(erro) });
  }
}

// ── Escrita (backup diario) ───────────────────────────────────
// mode 'overwrite': primeiro lote (chunk_index 0) limpa a aba e escreve o
// cabecalho antes das linhas — usado por agents/protocols/patients, que sao
// sempre a foto do estado atual.
// mode 'append': nunca limpa, so acrescenta linhas no fim — usado por
// followups, que e historico e cresce pra sempre.
function gravarLote(corpo) {
  if (!corpo.sheet || !Array.isArray(corpo.headers) || !Array.isArray(corpo.rows)) {
    return { ok: false, error: 'missing_fields' };
  }

  var planilha = getSpreadsheet();
  var aba = planilha.getSheetByName(corpo.sheet) || planilha.insertSheet(corpo.sheet);

  // Texto puro em toda a aba, sempre — sem isso o Sheets tenta adivinhar tipo
  // por conteudo (ex: "2026-08-01" vira celula de Data de verdade) e o valor
  // volta corrompido num restore (formato diferente do que o D1 espera, mesma
  // armadilha de data que o README ja documenta pra outras colunas). Aplicado
  // na coluna inteira, nao so nas linhas de hoje, pra cobrir tambem o
  // cabecalho e qualquer formatacao residual de uma aba antiga.
  aba.getRange(1, 1, aba.getMaxRows(), corpo.headers.length).setNumberFormat('@');

  if (corpo.mode === 'overwrite' && corpo.chunk_index === 0) {
    aba.clearContents();
    aba.getRange(1, 1, 1, corpo.headers.length).setValues([corpo.headers]);
  } else if (aba.getLastRow() === 0) {
    // Aba nova (primeira vez que 'append' escreve nela) tambem precisa do
    // cabecalho, mesmo sem ser um lote 'overwrite'.
    aba.getRange(1, 1, 1, corpo.headers.length).setValues([corpo.headers]);
  }

  if (corpo.rows.length > 0) {
    var primeiraLinhaLivre = aba.getLastRow() + 1;
    aba.getRange(primeiraLinhaLivre, 1, corpo.rows.length, corpo.headers.length).setValues(corpo.rows);
  }

  return { ok: true, sheet: corpo.sheet, rows_written: corpo.rows.length };
}

// ── Leitura (restore, so no dia do desastre) ──────────────────
// Devolve as 4 abas inteiras como JSON. So chega aqui quem tem o token —
// mesma fronteira de confianca que ja protege a escrita.
function exportarParaRestore() {
  var planilha = getSpreadsheet();
  var nomes = ['Agentes', 'Protocolos', 'Pacientes', 'Contatos'];
  var sheets = {};

  nomes.forEach(function (nome) {
    var aba = planilha.getSheetByName(nome);
    if (!aba || aba.getLastRow() === 0) {
      sheets[nome] = { headers: [], rows: [] };
      return;
    }
    var valores = aba.getDataRange().getValues();
    sheets[nome] = { headers: valores[0], rows: valores.slice(1) };
  });

  return { ok: true, sheets: sheets };
}

// Apps Script devolve 200 mesmo em erro de aplicacao; o Worker decide pelo
// campo `ok` do corpo, nao pelo status HTTP.
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
