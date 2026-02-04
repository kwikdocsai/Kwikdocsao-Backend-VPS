
-- Migração: Visão Agrupada de Erros Fiscais (Priorização Operacional)
-- Agrupa múltiplos alertas por documento para facilitar a resolução em lote

CREATE OR REPLACE VIEW view_grouped_fiscal_errors AS
SELECT 
    d.id as doc_id,
    COALESCE(d.data -> 'issuer_data' ->> 'name', d.data ->> 'merchantName', 'Desconhecido') as vendor_name,
    COALESCE((d.data ->> 'totalAmount')::numeric, 0) as invoice_amount,
    d.file_name,
    d.company_id,
    COUNT(a.id) as error_count,
    MAX(CASE 
        WHEN a.severity = 'CRITICAL' THEN 3 
        WHEN a.severity = 'WARNING' THEN 2 
        ELSE 1 
    END) as severity_rank,
    CASE 
        WHEN MAX(CASE WHEN a.severity = 'CRITICAL' THEN 3 WHEN a.severity = 'WARNING' THEN 2 ELSE 1 END) = 3 THEN 'CRITICAL'
        WHEN MAX(CASE WHEN a.severity = 'CRITICAL' THEN 3 WHEN a.severity = 'WARNING' THEN 2 ELSE 1 END) = 2 THEN 'WARNING'
        ELSE 'INFO'
    END as peak_severity,
    jsonb_agg(jsonb_build_object(
        'alert_id', a.id,
        'agent_name', a.agent_name,
        'title', a.title,
        'message', a.message,
        'detected_at', a.created_at
    )) as alerts_detail,
    array_agg(DISTINCT a.agent_name) as involved_agents,
    MAX(a.created_at) as last_detected_at
FROM documents d
JOIN ai_alerts a ON d.id = a.document_id
WHERE a.is_resolved = false
GROUP BY d.id;

COMMENT ON VIEW view_grouped_fiscal_errors IS 'Vista agregada para priorização de erros fiscais por documento';
