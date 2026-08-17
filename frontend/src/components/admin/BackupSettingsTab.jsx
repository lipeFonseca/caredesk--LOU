import { useState, useEffect } from 'react'
import { api } from '@/services/api'

// Configuracao do backup diario pro Google Sheets — credenciais proprias,
// independentes das do relay de e-mail (aba Mensageria). Passo a passo de
// publicacao do Apps Script esta em docs/GOOGLE-SHEETS-BACKUP.md.
export default function BackupSettingsTab() {
  const [form, setForm] = useState({
    backup_enabled:     '0',
    backup_relay_url:   '',
    backup_relay_token: '',
  })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando]     = useState(false)
  const [testando, setTestando]     = useState(false)
  const [rodando, setRodando]       = useState(false)
  const [feedback, setFeedback]     = useState(null)
  const [ultimaExecucao, setUltimaExecucao] = useState(null)

  useEffect(() => {
    api.settings.get()
      .then((data) => {
        setForm({
          backup_enabled:     data.backup_enabled ?? '0',
          backup_relay_url:   data.backup_relay_url ?? '',
          // Vem mascarado do servidor. Reenviar mascarado nao sobrescreve o
          // token salvo — o backend ignora valor mascarado de proposito.
          backup_relay_token: data.backup_relay_token ?? '',
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

  async function testarConexao() {
    setTestando(true)
    setFeedback(null)
    try {
      const data = await api.settings.testBackup()
      setFeedback({ tipo: 'ok', texto: `Conexão ok — ${data.agents?.rows ?? 0} agente(s) enviado(s) de teste.` })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Falha no teste de conexão.' })
    } finally {
      setTestando(false)
    }
  }

  async function rodarAgora() {
    setRodando(true)
    setFeedback(null)
    try {
      const data = await api.settings.runBackupNow()
      setUltimaExecucao({
        quando: new Date(),
        agentes: data.agents?.rows ?? 0,
        protocolos: data.protocols?.rows ?? 0,
        pacientes: data.patients?.rows ?? 0,
        contatos: data.followups?.rows ?? 0,
      })
      setFeedback({ tipo: 'ok', texto: 'Backup completo executado com sucesso.' })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Falha ao rodar o backup.' })
    } finally {
      setRodando(false)
    }
  }

  if (carregando) {
    return (
      <div className="bg-surface rounded-xl border border-outline-variant p-6 flex flex-col gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface-container-low animate-pulse rounded" />)}
      </div>
    )
  }

  const backupAtivo = form.backup_enabled === '1'

  return (
    <div className="bg-surface rounded-xl border border-outline-variant ambient-shadow-lvl1 p-6">
      <div className="mb-6 pb-4 border-b border-outline-variant">
        <h2 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-outline">cloud_upload</span>
          Backup
        </h2>
        <p className="text-body-md text-on-surface-variant mt-1">
          Exporta equipe, protocolos, pacientes e histórico de contato para uma Google Planilha
          todo dia à meia-noite, com restore em caso de desastre. Passo a passo de publicação do
          Apps Script em <code>docs/GOOGLE-SHEETS-BACKUP.md</code>.
        </p>
      </div>

      <form onSubmit={salvar} className="space-y-5 max-w-2xl">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={backupAtivo}
            onChange={(evento) => {
              setForm((atual) => ({ ...atual, backup_enabled: evento.target.checked ? '1' : '0' }))
              setFeedback(null)
            }}
            disabled={salvando}
          />
          <span>
            <span className="text-body-md text-on-surface">Backup diário ativo</span>
            <span className="block text-label-sm text-outline">
              Desligado, a faxina noturna continua rodando normalmente, só não exporta nada.
            </span>
          </span>
        </label>

        <div>
          <label className="label">URL do Apps Script</label>
          <input
            className="input"
            placeholder="https://script.google.com/macros/s/.../exec"
            value={form.backup_relay_url}
            onChange={set('backup_relay_url')}
            disabled={salvando}
          />
          <p className="text-label-sm text-outline mt-1">
            Implantação própria, separada do relay de e-mail — pode (e é recomendado) usar uma
            conta Google diferente. Termina em <code>/exec</code>.
          </p>
        </div>

        <div>
          <label className="label">Token do relay</label>
          <input
            type="password"
            className="input"
            placeholder="cole o token para definir ou trocar"
            value={form.backup_relay_token}
            onChange={set('backup_relay_token')}
            autoComplete="off"
            disabled={salvando}
          />
          <p className="text-label-sm text-outline mt-1">
            Mesmo valor da propriedade <code>RELAY_TOKEN</code> no Apps Script do backup. Guarde
            também uma cópia fora do sistema (gerenciador de senhas) — em caso de perda total do
            banco, o restore precisa dela e não pode ler daqui.
          </p>
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
            onClick={testarConexao}
            className="btn-ghost"
            disabled={testando || rodando || salvando}
          >
            {testando ? 'Testando...' : 'Testar conexão'}
          </button>
          <button
            type="button"
            onClick={rodarAgora}
            className="btn-ghost"
            disabled={rodando || testando || salvando}
          >
            {rodando ? 'Rodando backup...' : 'Rodar backup agora'}
          </button>
        </div>

        <p className="text-label-sm text-outline">
          Salve antes de testar ou rodar — as duas ações usam o que está gravado, não o que está
          na tela.
        </p>
      </form>

      {ultimaExecucao && (
        <div className="mt-6 pt-5 border-t border-outline-variant">
          <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-3">
            Última execução manual
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricaBackup rotulo="Agentes" valor={ultimaExecucao.agentes} />
            <MetricaBackup rotulo="Protocolos" valor={ultimaExecucao.protocolos} />
            <MetricaBackup rotulo="Pacientes" valor={ultimaExecucao.pacientes} />
            <MetricaBackup rotulo="Contatos novos" valor={ultimaExecucao.contatos} />
          </div>
          <p className="text-label-sm text-outline mt-3">
            {ultimaExecucao.quando.toLocaleString('pt-BR')}
          </p>
        </div>
      )}
    </div>
  )
}

function MetricaBackup({ rotulo, valor }) {
  return (
    <div className="bg-surface-container-low rounded-lg border border-outline-variant p-3">
      <p className="text-label-sm text-outline">{rotulo}</p>
      <p className="text-headline-sm font-headline-sm text-on-surface">{valor}</p>
    </div>
  )
}
