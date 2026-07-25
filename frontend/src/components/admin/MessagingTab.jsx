import { useState, useEffect } from 'react'
import { api } from '@/services/api'
import EmailTemplateEditor from '@/components/admin/EmailTemplateEditor'

// Configuracao do envio de e-mail (hoje usado so pelo fluxo de redefinicao de
// senha). O passo a passo de publicacao do Apps Script esta em
// docs/EMAIL-APPS-SCRIPT.md.
export default function MessagingTab() {
  const [form, setForm] = useState({
    email_enabled:    '1',
    email_relay_url:  '',
    email_relay_token: '',
    email_from_name:  '',
  })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando]     = useState(false)
  const [testando, setTestando]     = useState(false)
  const [feedback, setFeedback]     = useState(null)

  useEffect(() => {
    api.settings.get()
      .then((data) => {
        setForm({
          email_enabled:     data.email_enabled ?? '1',
          email_relay_url:   data.email_relay_url ?? '',
          // Vem mascarado do servidor. Reenviar mascarado nao sobrescreve o
          // token salvo — o backend ignora valor mascarado de proposito.
          email_relay_token: data.email_relay_token ?? '',
          email_from_name:   data.email_from_name ?? '',
        })
      })
      .catch(() => setFeedback({ tipo: 'erro', texto: 'Não foi possível carregar a configuração.' }))
      .finally(() => setCarregando(false))
  }, [])

  function set(campo) {
    return (evento) => {
      setForm((atual) => ({ ...atual, [campo]: evento.target.value }))
      setFeedback(null)
    }
  }

  async function salvar(evento) {
    evento.preventDefault()
    setSalvando(true)
    setFeedback(null)
    try {
      await api.settings.update(form)
      setFeedback({ tipo: 'ok', texto: 'Configuração salva.' })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Não foi possível salvar.' })
    } finally {
      setSalvando(false)
    }
  }

  async function enviarTeste() {
    setTestando(true)
    setFeedback(null)
    try {
      const data = await api.settings.testEmail()
      const cota = data.remainingQuota != null ? ` Cota restante hoje: ${data.remainingQuota}.` : ''
      setFeedback({ tipo: 'ok', texto: `E-mail de teste enviado para ${data.sentTo}.${cota}` })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Falha no envio de teste.' })
    } finally {
      setTestando(false)
    }
  }

  if (carregando) {
    return (
      <div className="bg-surface rounded-xl border border-outline-variant p-6 flex flex-col gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface-container-low animate-pulse rounded" />)}
      </div>
    )
  }

  const envioAtivo = form.email_enabled !== '0'

  return (
    <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
      <div className="mb-6 pb-4 border-b border-outline-variant">
        <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-outline">mail</span>
          Mensageria
        </h2>
        <p className="text-body-md text-on-surface-variant mt-1">
          Envio de e-mail usado pela redefinição de senha. O CareDesk envia através de um
          Google Apps Script publicado na conta da clínica — o remetente é o Gmail dela.
        </p>
      </div>

      <form onSubmit={salvar} className="space-y-5 max-w-2xl">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={envioAtivo}
            onChange={(evento) => {
              setForm((atual) => ({ ...atual, email_enabled: evento.target.checked ? '1' : '0' }))
              setFeedback(null)
            }}
            disabled={salvando}
          />
          <span>
            <span className="text-body-md text-on-surface">Envio de e-mail ativo</span>
            <span className="block text-label-sm text-outline">
              Desligado, o pedido de redefinição continua respondendo normalmente, mas nenhum e-mail sai.
            </span>
          </span>
        </label>

        <div>
          <label className="label">URL do Apps Script</label>
          <input
            className="input"
            placeholder="https://script.google.com/macros/s/.../exec"
            value={form.email_relay_url}
            onChange={set('email_relay_url')}
            disabled={salvando}
          />
          <p className="text-label-sm text-outline mt-1">
            URL da implantação como aplicativo da web. Termina em <code>/exec</code>.
          </p>
        </div>

        <div>
          <label className="label">Token do relay</label>
          <input
            type="password"
            className="input"
            placeholder="cole o token para definir ou trocar"
            value={form.email_relay_token}
            onChange={set('email_relay_token')}
            autoComplete="off"
            disabled={salvando}
          />
          <p className="text-label-sm text-outline mt-1">
            Mesmo valor da propriedade <code>RELAY_TOKEN</code> no Apps Script. Por segurança,
            só os últimos caracteres do token salvo aparecem aqui — deixe como está para manter o atual.
          </p>
        </div>

        <div>
          <label className="label">Nome do remetente</label>
          <input
            className="input"
            placeholder="CareDesk"
            value={form.email_from_name}
            onChange={set('email_from_name')}
            disabled={salvando}
          />
        </div>

        {feedback && (
          <p className={`rounded-xl px-4 py-3 text-body-md ${
            feedback.tipo === 'ok'
              ? 'bg-secondary-container/20 text-on-secondary-container'
              : 'bg-error-container/20 text-error'
          }`}>
            {feedback.texto}
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={enviarTeste}
            className="btn-ghost"
            disabled={testando || salvando}
          >
            {testando ? 'Enviando...' : 'Enviar e-mail de teste'}
          </button>
        </div>

        <p className="text-label-sm text-outline">
          O teste vai para o e-mail da sua própria conta. Salve antes de testar — o envio usa o
          que está gravado, não o que está na tela.
        </p>
      </form>

      <EmailTemplateEditor />
    </div>
  )
}
