
-- Adicionar colunas de resolução para conformidade Angolana
ALTER TABLE ai_alerts 
ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS resolution_action TEXT;

COMMENT ON COLUMN ai_alerts.is_resolved IS 'Indica se a inconsistência fiscal foi tratada pelo contabilista';
COMMENT ON COLUMN ai_alerts.resolution_action IS 'Ação tomada: ACEITAR_RISCO ou RESOLVER_DUPLICADO';
