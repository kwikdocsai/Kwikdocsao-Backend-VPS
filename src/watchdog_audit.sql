
-- Watchdog SAFT-AO Compliance Logic
-- Audits current month documents for legal requirements

WITH target_docs AS (
    SELECT 
        id as doc_id,
        company_id,
        file_name,
        (data ->> 'totalAmount')::numeric as total,
        COALESCE(data ->> 'invoiceNo', data ->> 'numero_fatura', '') as inv_no,
        (data ->> 'date')::date as doc_date,
        COALESCE(data -> 'client_data' ->> 'nif', data ->> 'client_nif', '') as client_nif
    FROM documents
    WHERE data IS NOT NULL
    AND created_at >= date_trunc('month', CURRENT_DATE) -- Only current month uploads/processing
),
compliance_issues AS (
    -- 1. Missing Invoice Number
    SELECT 
        doc_id,
        company_id,
        'Pendência de Compliance SAFT' as title,
        'O número da fatura (invoiceNo) está ausente ou vazio. Documento inválido para processamento SAFT.' as message,
        jsonb_build_object('doc_id', doc_id, 'issue', 'missing_invoice_no') as metadata
    FROM target_docs
    WHERE inv_no = ''
    
    UNION ALL
    
    -- 2. Date Older than 90 Days (VAT Risk - specific check for current month newly discovered old docs)
    SELECT 
        doc_id,
        company_id,
        'Pendência de Compliance SAFT' as title,
        'Documento datado de ' || doc_date || ' ultrapassa o limite de 90 dias para dedução de IVA.' as message,
        jsonb_build_object('doc_id', doc_id, 'issue', 'vat_deduction_risk') as metadata
    FROM target_docs
    WHERE doc_date < CURRENT_DATE - INTERVAL '90 days'

    UNION ALL

    -- 3. Missing Client NIF for high value (> 250.000 Kz)
    SELECT 
        doc_id,
        company_id,
        'Pendência de Compliance SAFT' as title,
        'Fatura de valor elevado (' || total || ' Kz) sem NIF do cliente. Obrigatório por lei para valores acima de 250.000 Kz.' as message,
        jsonb_build_object('doc_id', doc_id, 'issue', 'missing_client_nif_high_value') as metadata
    FROM target_docs
    WHERE total > 250000 AND (client_nif = '' OR client_nif IS NULL)
)
INSERT INTO ai_alerts (agent_name, severity, title, message, metadata, company_id)
SELECT 
    'Watchdog', 
    'WARNING', 
    c.title, 
    c.message, 
    c.metadata, 
    c.company_id
FROM compliance_issues c
WHERE NOT EXISTS (
    SELECT 1 FROM ai_alerts a 
    WHERE a.agent_name = 'Watchdog' 
    AND a.metadata ->> 'doc_id' = c.doc_id::text
    AND a.metadata ->> 'issue' = c.metadata ->> 'issue'
)
RETURNING metadata ->> 'doc_id' as affected_doc;
