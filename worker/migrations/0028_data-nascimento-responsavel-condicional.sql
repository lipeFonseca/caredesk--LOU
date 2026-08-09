-- Idade nao e guardada como numero fixo (ficaria errada com o tempo, mesmo
-- problema que next_followup_date materializada evita em outro lugar do
-- schema): guarda a data de nascimento, idade e derivada na hora da leitura.
-- responsavel (0027) deixa de ser sempre obrigatorio -- vira obrigatorio so
-- quando o paciente e menor de idade, validado no backend a partir desta
-- coluna. Coluna ja era nullable, sem mudanca de schema necessaria nela.
ALTER TABLE patients ADD COLUMN data_nascimento TEXT;
