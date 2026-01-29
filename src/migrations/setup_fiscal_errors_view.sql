
-- Migração de Engenharia de Dados: Integridade e Performance
-- 1. Adicionar coluna document_id para relação forte
ALTER TABLE ai_alerts 
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE CASCADE;

-- 2. Backfill de document_id a partir do metadata
UPDATE ai_alerts 
SET document_id = (metadata ->> 'doc_id')::UUID
WHERE document_id IS NULL 
AND metadata ->> 'doc_id' IS NOT NULL;

-- 3. Criar Índice para Performance de Join
CREATE INDEX IF NOT EXISTS idx_ai_alerts_document_id ON ai_alerts(document_id);

-- 4. Criar View para a Página de Erros Fiscais
CREATE OR REPLACE VIEW view_active_fiscal_errors AS
SELECT 
    a.id as alert_id,
    a.agent_name,
    a.severity,
    a.title,
    a.message as error_description,
    a.is_resolved,
    a.created_at as detected_at,
    d.id as doc_id,
    COALESCE(d.data -> 'issuer_data' ->> 'name', d.data ->> 'merchantName', 'Desconhecido') as vendor_name,
    COALESCE(d.valor_documento, 0) as invoice_amount,
    d.file_name,
    d.company_id
FROM ai_alerts a
JOIN documents d ON a.document_id = d.id
WHERE a.is_resolved = false;

COMMENT ON VIEW view_active_fiscal_errors IS 'Fonte de dados otimizada para a UI de Erros Fiscais (Angola)';
