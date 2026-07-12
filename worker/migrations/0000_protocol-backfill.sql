-- Fase segura antes da limpeza: garantir que pacientes sem protocolo
-- passem a apontar para o protocolo default quando ele existir.
UPDATE patients
SET protocol_id = (
  SELECT id
  FROM contact_protocols
  WHERE is_default = 1
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
)
WHERE (protocol_id IS NULL OR trim(protocol_id) = '')
  AND EXISTS (
    SELECT 1
    FROM contact_protocols
    WHERE is_default = 1
  );
