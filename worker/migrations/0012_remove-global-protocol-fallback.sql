-- Remove o fallback global de dias de protocolo (app_settings.contact_protocol_days).
-- Nunca teve UI de edicao real (a rota que o escrevia, PATCH /api/settings/protocol,
-- nunca foi chamada pelo frontend) e o valor residual em producao ('[-50,-2,0,2,5]')
-- fazia a Linha do Tempo aparecer com dias inventados para pacientes sem nenhum
-- protocolo de contato vinculado. resolvePatientProtocol() agora so resolve via
-- protocolo linkado (LINKED); sem protocolo vinculado, o paciente fica em EMPTY.
DELETE FROM app_settings WHERE key = 'contact_protocol_days';
