import { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '@/services/api'

const ROTULO_DO_TIPO = {
  password_reset: {
    nome: 'Redefinição de senha',
    descricao: 'Enviado quando alguém pede um código pela tela "Esqueci minha senha".',
  },
  daily_digest: {
    nome: 'Resumo diário do agente',
    descricao: 'Enviado às 20h para cada agente com e-mail cadastrado: o desempenho do dia e os pacientes a contatar amanhã.',
  },
}

// Valores fictícios só pro preview — o envio real usa dados do banco.
const EXEMPLO = {
  agent_name: 'Ana Souza',
  code: '482913',
  expires_in_minutes: '15',
  clinic_name: 'Clínica Exemplo',
  today_date: '25/07/2026',
  tomorrow_date: '26/07/2026',
  contacts_logged: '7',
  reached_count: '5',
  no_answer_count: '1',
  callback_count: '1',
  today_chart: '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr height="12"><td width="71%" bgcolor="#2e7d32" style="background:#2e7d32;font-size:1px;line-height:12px;">&nbsp;</td><td width="15%" bgcolor="#ef6c00" style="background:#ef6c00;font-size:1px;line-height:12px;">&nbsp;</td><td width="14%" bgcolor="#c62828" style="background:#c62828;font-size:1px;line-height:12px;">&nbsp;</td></tr></table><p style="margin:8px 0 0;"><span style="display:inline-block;margin-right:16px;color:#4a4a4a;font-size:13px;"><span style="display:inline-block;width:10px;height:10px;background:#2e7d32;margin-right:6px;"></span>Alcançados: <strong>5</strong></span><span style="display:inline-block;margin-right:16px;color:#4a4a4a;font-size:13px;"><span style="display:inline-block;width:10px;height:10px;background:#ef6c00;margin-right:6px;"></span>Retorno agendado: <strong>1</strong></span><span style="display:inline-block;margin-right:16px;color:#4a4a4a;font-size:13px;"><span style="display:inline-block;width:10px;height:10px;background:#c62828;margin-right:6px;"></span>Sem resposta: <strong>1</strong></span></p>',
  overdue_count: '2',
  overdue_list: '<ul style="padding-left:18px"><li><strong>Marcos Vieira</strong> — (85) 98888-7777<br><span style="color:#c62828">3 dias de atraso</span> · <span style="color:#6b6b6b">Prótese de quadril</span></li></ul>',
  tomorrow_total: '3',
  tomorrow_list: '<ul style="padding-left:18px"><li><strong>João Lima</strong> — (85) 99999-9999<br><span style="color:#6b6b6b">Artroscopia · 7 dia(s) de pós-operatório</span></li></ul>',
}

export default function EmailTemplateEditor() {
  const [templates, setTemplates]       = useState([])
  const [placeholders, setPlaceholders] = useState({})
  const [tipoAtivo, setTipoAtivo]       = useState('daily_digest')
  const [form, setForm]                 = useState({ subject: '', body_html: '', is_enabled: true })
  const [carregando, setCarregando]     = useState(true)
  const [salvando, setSalvando]         = useState(false)
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [feedback, setFeedback]         = useState(null)
  const corpoRef = useRef(null)

  useEffect(() => {
    api.settings.getEmailTemplates()
      .then((data) => {
        setTemplates(data.templates ?? [])
        setPlaceholders(data.placeholders ?? {})
      })
      .catch(() => setFeedback({ tipo: 'erro', texto: 'Não foi possível carregar os templates.' }))
      .finally(() => setCarregando(false))
  }, [])

  // Troca de aba recarrega o formulário a partir do template já buscado.
  useEffect(() => {
    const atual = templates.find((t) => t.tipo === tipoAtivo)
    if (atual) {
      setForm({
        subject: atual.subject,
        body_html: atual.body_html,
        is_enabled: atual.is_enabled !== 0,
      })
    }
  }, [tipoAtivo, templates])

  const previewHtml = useMemo(() => renderizarComExemplo(form.body_html), [form.body_html])

  function set(campo) {
    return (evento) => {
      setForm((atual) => ({ ...atual, [campo]: evento.target.value }))
      setFeedback(null)
    }
  }

  // Insere na posição do cursor em vez de no fim: escrevendo um corpo longo,
  // ter que recortar e colar de volta seria irritante.
  function inserirPlaceholder(chave) {
    const campo = corpoRef.current
    const marcador = `{{${chave}}}`

    if (!campo) {
      setForm((atual) => ({ ...atual, body_html: atual.body_html + marcador }))
      return
    }

    const { selectionStart, selectionEnd, value } = campo
    const novoCorpo = value.slice(0, selectionStart) + marcador + value.slice(selectionEnd)
    setForm((atual) => ({ ...atual, body_html: novoCorpo }))

    requestAnimationFrame(() => {
      campo.focus()
      campo.setSelectionRange(selectionStart + marcador.length, selectionStart + marcador.length)
    })
  }

  async function salvar(evento) {
    evento.preventDefault()
    setSalvando(true)
    setFeedback(null)
    try {
      await api.settings.saveEmailTemplate(tipoAtivo, form)
      setTemplates((atuais) => atuais.map((t) => (
        t.tipo === tipoAtivo ? { ...t, ...form, is_enabled: form.is_enabled ? 1 : 0 } : t
      )))
      setFeedback({ tipo: 'ok', texto: 'Template salvo.' })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Não foi possível salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  async function enviarTeste() {
    setEnviandoTeste(true)
    setFeedback(null)
    try {
      const data = tipoAtivo === 'daily_digest'
        ? await api.settings.testDigest()
        : await api.settings.testEmail()
      setFeedback({ tipo: 'ok', texto: `Enviado para ${data.sentTo}. Salve antes de testar — o envio usa o que está gravado.` })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Falha no envio de teste.' })
    } finally {
      setEnviandoTeste(false)
    }
  }

  if (carregando) {
    return <div className="h-40 bg-surface-container-low animate-pulse rounded-xl" />
  }

  const placeholdersDoTipo = placeholders[tipoAtivo] ?? []
  const info = ROTULO_DO_TIPO[tipoAtivo] ?? {}

  return (
    <div className="mt-8 pt-6 border-t border-outline-variant">
      <h3 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-outline">edit_note</span>
        Modelos de e-mail
      </h3>
      <p className="text-body-md text-on-surface-variant mt-1 mb-5">
        O corpo aceita HTML. Clientes de e-mail ignoram CSS moderno — prefira estilo inline e tabelas simples.
      </p>

      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit border border-outline-variant mb-5">
        {Object.keys(ROTULO_DO_TIPO).map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => { setTipoAtivo(tipo); setFeedback(null) }}
            className={`px-4 py-2 rounded-lg text-label-md font-label-md transition-all ${
              tipoAtivo === tipo
                ? 'bg-surface text-on-surface ambient-shadow-lvl1'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {ROTULO_DO_TIPO[tipo].nome}
          </button>
        ))}
      </div>

      <p className="text-label-sm text-outline mb-4">{info.descricao}</p>

      <form onSubmit={salvar} className="space-y-5">
        <div>
          <label className="label">Assunto</label>
          <input className="input" value={form.subject} onChange={set('subject')} disabled={salvando} />
        </div>

        <div>
          <label className="label">Corpo (HTML)</label>
          <textarea
            ref={corpoRef}
            className="input font-mono text-label-sm"
            rows={14}
            value={form.body_html}
            onChange={set('body_html')}
            disabled={salvando}
            spellCheck={false}
          />
        </div>

        <div>
          <p className="text-label-sm font-label-sm text-on-surface-variant mb-2">
            Campos disponíveis — clique para inserir onde o cursor estiver:
          </p>
          <div className="flex flex-wrap gap-2">
            {placeholdersDoTipo.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => inserirPlaceholder(key)}
                title={label}
                className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-low text-label-sm font-mono hover:border-primary hover:text-primary transition-colors"
              >
                {`{{${key}}}`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-label-sm font-label-sm text-on-surface-variant mb-2">
            Prévia (com dados de exemplo):
          </p>
          {/* `allow-same-origin` sem `allow-scripts`: sem script, o conteudo nao
              tem como tocar no documento pai, e a origem deixa de ser opaca — com
              sandbox vazio o CSP `default-src 'self'` bloqueava a renderizacao e o
              preview ficava em branco. O CSP declara `frame-src 'self'` por isso. */}
          <iframe
            title="Prévia do e-mail"
            sandbox="allow-same-origin"
            srcDoc={`<body style="margin:0;padding:16px;background:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${previewHtml}</body>`}
            className="w-full h-72 rounded-xl border border-outline-variant bg-white"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={(evento) => {
              setForm((atual) => ({ ...atual, is_enabled: evento.target.checked }))
              setFeedback(null)
            }}
            disabled={salvando}
          />
          <span className="text-body-md text-on-surface">Este e-mail está ativo</span>
        </label>

        {feedback && (
          <p className={`rounded-xl px-4 py-3 text-body-md ${
            feedback.tipo === 'ok'
              ? 'bg-secondary-container/20 text-on-secondary-container'
              : 'bg-error-container/20 text-error'
          }`}>
            {feedback.texto}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar modelo'}
          </button>
          <button type="button" onClick={enviarTeste} className="btn-ghost" disabled={enviandoTeste || salvando}>
            {enviandoTeste ? 'Enviando...' : 'Enviar para mim'}
          </button>
        </div>
      </form>
    </div>
  )
}

function renderizarComExemplo(html) {
  return String(html ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, chave) => EXEMPLO[chave] ?? '')
}
