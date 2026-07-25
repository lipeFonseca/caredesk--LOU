-- Campos de contato opcionais pedidos pela clinica.
--
-- patients.email: paciente ja tinha `phone`, faltava e-mail. (Existiu uma coluna
-- email em patients antes; foi removida por nao ter uso. Volta agora com campo
-- no formulario.)
--
-- agents.phone: celular do agente. O e-mail do agente NAO entra aqui — a coluna
-- `email` de agents ja existe e e a propria credencial de login.
--
-- Os dois nascem opcionais (sem NOT NULL): decisao do usuario.

ALTER TABLE patients ADD COLUMN email TEXT;
ALTER TABLE agents   ADD COLUMN phone TEXT;
