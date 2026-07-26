// D1 falso para testar serviços sem banco real.
//
// Não é um SQLite em memória: casa a consulta por trecho do SQL e devolve o que
// o teste programou. Suficiente porque o que se testa aqui é a DECISÃO do
// serviço — quem entra, quem é pulado, o que é gravado —, não o dialeto SQL,
// que já é exercitado contra o D1 de verdade.

export function criarFakeD1(respostas = []) {
  const executadas = []

  function resolver(sql) {
    return respostas.find((r) => sql.includes(r.match))
  }

  const db = {
    executadas,

    // Consultas que o teste não programou devolvem vazio em vez de estourar:
    // o serviço não pode depender de ordem de chamada para funcionar.
    prepare(sql) {
      const registro = { sql, binds: [] }
      executadas.push(registro)
      const programada = resolver(sql)

      const statement = {
        bind(...binds) {
          registro.binds = binds
          return statement
        },
        async all()   { return { results: programada?.results ?? [] } },
        async first() { return programada?.first ?? programada?.results?.[0] ?? null },
        async run()   { return { meta: { changes: programada?.changes ?? 0 } } },
      }
      return statement
    },

    async batch(statements) {
      return Promise.all(statements.map((s) => s.run()))
    },
  }

  return db
}

// Açúcar para as asserções: encontra a consulta pelo trecho de SQL.
export function consultaPor(db, trecho) {
  return db.executadas.find((q) => q.sql.includes(trecho))
}

export function consultasPor(db, trecho) {
  return db.executadas.filter((q) => q.sql.includes(trecho))
}
