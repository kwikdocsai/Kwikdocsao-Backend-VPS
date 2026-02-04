
-- Migração: View de Análise Fiscal (Relatórios e Tendências)
-- Consolida dados financeiros mensais por empresa e categoria

CREATE OR REPLACE VIEW view_fiscal_analytics AS
SELECT 
    company_id,
    TO_CHAR(created_at, 'YYYY-MM') as mes_referencia,
    SUM(COALESCE(valor_documento, 0)) FILTER (WHERE tipo_movimento = 'ENTRADA') as volume_entrada,
    SUM(COALESCE(valor_documento, 0)) FILTER (WHERE tipo_movimento = 'SAIDA') as volume_saida,
    SUM(COALESCE(valor_iva, 0)) FILTER (WHERE tipo_movimento = 'ENTRADA') as iva_dedutivel,
    SUM(COALESCE(valor_iva, 0)) FILTER (WHERE tipo_movimento = 'SAIDA') as iva_liquidado,
    COUNT(*) as total_documentos,
    ROUND(
        (COUNT(*) FILTER (WHERE status_fiscal = 'CONFORME')::numeric / 
        NULLIF(COUNT(*), 0) * 100), 2
    ) as eficiencia_fiscal
FROM documents
GROUP BY company_id, mes_referencia;

-- Comentários para documentação do banco
COMMENT ON VIEW view_fiscal_analytics IS 'Consolidação mensal de métricas fiscais para relatórios e dashboards.';

-- Garantir índices para performance em consultas por período e empresa
CREATE INDEX IF NOT EXISTS idx_documents_company_created_at ON documents(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
