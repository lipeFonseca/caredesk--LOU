-- CPF (identificacao real do paciente) e Responsavel, obrigatorios a partir
-- de agora no cadastro. protocol_id nao muda de papel: continua o vinculo
-- com o protocolo de contato, CPF nunca foi pra substituir isso.
ALTER TABLE patients ADD COLUMN cpf TEXT;
ALTER TABLE patients ADD COLUMN responsavel TEXT;

-- Parcial: so exige unicidade quando o CPF existe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cpf ON patients(cpf) WHERE cpf IS NOT NULL;
