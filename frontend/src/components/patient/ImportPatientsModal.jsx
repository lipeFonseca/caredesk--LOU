import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/services/api'
import { parseCsv, linhasParaPacientes, IMPORT_COLUMNS } from '@/utils/patientImport'

const COLUNAS_OBRIGATORIAS = IMPORT_COLUMNS.filter((c) => c.obrigatorio).map((c) => c.key)
const COLUNAS_OPCIONAIS = IMPORT_COLUMNS.filter((c) => !c.obrigatorio).map((c) => c.key)

export default function ImportPatientsModal({ open, onClose, onImported }) {
  const [arquivo, setArquivo] = useState(null)
  const [linhas, setLinhas] = useState([])
  const [protocolos, setProtocolos] = useState([])
  const [protocolId, setProtocolId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const inputArquivoRef = useRef(null)

  useEffect(() => {
    if (!open) return
    api.protocols.list()
      .then((data) => {
        const lista = data ?? []
        setProtocolos(lista)
        const padrao = lista.find((p) => p.is_default)
        if (padrao) setProtocolId(padrao.id)
      })
      .catch(() => {})
  }, [open])

  if (!open) return null

  function reiniciar() {
    setArquivo(null)
    setLinhas([])
    setResultado(null)
    if (inputArquivoRef.current) inputArquivoRef.current.value = ''
  }

  function fechar() {
    reiniciar()
    onClose()
  }

  function aoSelecionarArquivo(file) {
    if (!file) return
    setResultado(null)
    setArquivo(file)

    const leitor = new FileReader()
    leitor.onload = () => {
      const { data } = parseCsv(String(leitor.result))
      setLinhas(linhasParaPacientes(data))
    }
    leitor.readAsText(file, 'utf-8')
  }

  const linhasComErro = linhas.filter((l) => l.erros.length > 0)
  const linhasValidas = linhas.filter((l) => l.erros.length === 0)
  const podeConfirmar = arquivo && linhas.length > 0 && linhasComErro.length === 0 && !enviando

  async function confirmarImportacao() {
    setEnviando(true)
    setResultado(null)
    try {
      const resposta = await api.patients.importMany({
        rows: linhasValidas.map((l) => l.paciente),
        protocol_id: protocolId,
      })
      setResultado({
        ok: true,
        arquivo: linhas.length,
        validas: linhasValidas.length,
        confirmadas: resposta.imported,
        finalizadoEm: new Date(),
      })
      onImported?.()
    } catch (err) {
      // `row` que o servidor devolve é a posição dentro do lote ENVIADO (só
      // linhas já válidas no cliente) — traduz de volta pra linha original do
      // arquivo do usuário usando `linhasValidas`, senão o número mostrado
      // aponta pra linha errada no Excel dele.
      const rowErrorsTraduzidos = (err.data?.row_errors ?? []).map(({ row, errors }) => ({
        row: row === 0 ? 0 : (linhasValidas[row - 2]?.row ?? row),
        errors,
      }))
      setResultado({
        ok: false,
        arquivo: linhas.length,
        validas: linhasValidas.length,
        confirmadas: 0,
        mensagem: err.message,
        rowErrors: rowErrorsTraduzidos,
        finalizadoEm: new Date(),
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={enviando ? undefined : fechar}
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-surface rounded-xl border border-outline-variant shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

          {/* ── Topo ──────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant shrink-0">
            <h3 className="text-label-lg font-label-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: '20px' }}>upload_file</span>
              Importar pacientes via CSV
            </h3>
            <button
              onClick={fechar}
              disabled={enviando}
              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
            </button>
          </div>

          {/* ── Conteúdo rolável ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Instruções de formato */}
            <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4 text-body-md text-on-surface-variant space-y-2">
              <p>
                Arquivo <strong>CSV</strong> com cabeçalho igual ao nome das colunas abaixo (sem tradução).
                No Excel: <em>Salvar como &gt; CSV UTF-8</em>.
              </p>
              <p>
                <strong>Obrigatórias:</strong> {COLUNAS_OBRIGATORIAS.join(', ')}
                {' — '}
                <strong>Opcionais:</strong> {COLUNAS_OPCIONAIS.join(', ')}
              </p>
              <p>Datas no formato <code>aaaa-mm-dd</code> ou <code>dd/mm/aaaa</code>. Paciente menor de 18 anos precisa de <code>responsavel</code> preenchido.</p>
            </div>

            {/* Seleção de arquivo */}
            <div className="flex items-center gap-3">
              <label className="btn-ghost cursor-pointer">
                <input
                  ref={inputArquivoRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  disabled={enviando}
                  onChange={(e) => aoSelecionarArquivo(e.target.files?.[0])}
                />
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>attach_file</span>
                {arquivo ? 'Trocar arquivo' : 'Selecionar CSV'}
              </label>
              {arquivo && <span className="text-body-md text-on-surface-variant truncate">{arquivo.name}</span>}
            </div>

            {/* Prévia / validação client-side */}
            {arquivo && linhas.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-body-md">
                  <span className="text-on-surface"><strong>{linhas.length}</strong> linha{linhas.length === 1 ? '' : 's'} no arquivo</span>
                  <span className="text-[#2e7d32]"><strong>{linhasValidas.length}</strong> válida{linhasValidas.length === 1 ? '' : 's'}</span>
                  {linhasComErro.length > 0 && (
                    <span className="text-error"><strong>{linhasComErro.length}</strong> com erro</span>
                  )}
                </div>

                {linhasComErro.length > 0 && (
                  <div className="border border-error/30 bg-error-container/10 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-body-md">
                      <thead className="bg-error-container/20 text-label-sm font-label-sm text-on-error-container sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-16">Linha</th>
                          <th className="px-3 py-2">Erros</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhasComErro.map((l) => (
                          <tr key={l.row} className="border-t border-error/20">
                            <td className="px-3 py-2 text-on-surface font-medium">{l.row}</td>
                            <td className="px-3 py-2 text-on-surface-variant">{l.erros.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {linhasComErro.length === 0 && (
                  <div className="border border-outline-variant rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-body-md">
                      <thead className="bg-surface-container-low text-label-sm font-label-sm text-on-surface-variant sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-16">Linha</th>
                          <th className="px-3 py-2">Nome</th>
                          <th className="px-3 py-2">CPF</th>
                          <th className="px-3 py-2">Procedimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhasValidas.map((l) => (
                          <tr key={l.row} className="border-t border-outline-variant">
                            <td className="px-3 py-2 text-on-surface-variant">{l.row}</td>
                            <td className="px-3 py-2 text-on-surface">{l.paciente.name}</td>
                            <td className="px-3 py-2 text-on-surface-variant">{l.paciente.cpf}</td>
                            <td className="px-3 py-2 text-on-surface-variant">{l.paciente.procedure}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Seletor de protocolo */}
            {arquivo && linhasValidas.length > 0 && linhasComErro.length === 0 && (
              <div className="relative max-w-sm">
                <label className="block text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Protocolo do lote
                </label>
                <select
                  className="input appearance-none pr-10"
                  value={protocolId}
                  onChange={(e) => setProtocolId(e.target.value)}
                  disabled={enviando}
                >
                  <option value="">Protocolo padrão do sistema</option>
                  {protocolos.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-[38px] text-outline pointer-events-none" style={{ fontSize: '20px' }}>expand_more</span>
              </div>
            )}

            {/* ── Monitor de importação ────────────────────────── */}
            {enviando && (
              <div className="flex items-center gap-2 text-body-md text-on-surface-variant">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-outline/40 border-t-primary" />
                Importando e confirmando no banco...
              </div>
            )}

            {resultado && (
              <div className={`rounded-lg border p-4 space-y-3 ${resultado.ok ? 'border-[#c8e6c9] bg-[#e8f5e9]' : 'border-error/30 bg-error-container/10'}`}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: resultado.ok ? '#2e7d32' : undefined }}>
                    {resultado.ok ? 'check_circle' : 'error'}
                  </span>
                  <p className={`text-label-md font-label-md ${resultado.ok ? 'text-[#2e7d32]' : 'text-error'}`}>
                    {resultado.ok ? 'Importação concluída e confirmada no banco' : 'Importação não realizada — nenhum paciente foi criado'}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-body-md text-on-surface">
                  <span>Arquivo: <strong>{resultado.arquivo}</strong></span>
                  <span>Válidas: <strong>{resultado.validas}</strong></span>
                  <span>Confirmadas no banco: <strong>{resultado.confirmadas}</strong></span>
                </div>

                <p className="text-label-sm text-on-surface-variant">
                  Finalizado às {resultado.finalizadoEm.toLocaleTimeString('pt-BR')}
                </p>

                {!resultado.ok && (
                  <>
                    <p className="text-body-md text-on-surface-variant">{resultado.mensagem}</p>
                    {resultado.rowErrors?.length > 0 && (
                      <div className="border border-error/20 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-body-md">
                          <thead className="bg-error-container/20 text-label-sm font-label-sm text-on-error-container sticky top-0">
                            <tr>
                              <th className="px-3 py-2 w-16">Linha</th>
                              <th className="px-3 py-2">Erros</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resultado.rowErrors.map((re, i) => (
                              <tr key={i} className="border-t border-error/20">
                                <td className="px-3 py-2 text-on-surface font-medium">{re.row === 0 ? '—' : re.row}</td>
                                <td className="px-3 py-2 text-on-surface-variant">{re.errors.join('; ')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Rodapé ────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-outline-variant shrink-0">
            {resultado?.ok ? (
              <button onClick={fechar} className="btn-primary">Concluir</button>
            ) : (
              <>
                <button onClick={fechar} className="btn-ghost" disabled={enviando}>Cancelar</button>
                <button onClick={confirmarImportacao} className="btn-primary" disabled={!podeConfirmar}>
                  {enviando ? 'Importando...' : `Confirmar importação (${linhasValidas.length})`}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
