
-- Sentinel DB Audit Logic
-- Identifies IVA calculation errors and invalid NIFs

WITH fiscal_docs AS (
    SELECT 
        id as doc_id,
        company_id,
        file_name,
        (data ->> 'totalAmount')::numeric as total,
        COALESCE((data ->> 'taxAmount')::numeric, 0) as tax,
        COALESCE(
            (data ->> 'taxableBase')::numeric, 
            (data ->> 'subtotal')::numeric, 
            0
        ) as base,
        COALESCE(data -> 'issuer_data' ->> 'nif', data ->> 'nif', '') as issuer_nif
    FROM documents
    WHERE data IS NOT NULL
),
errors AS (
    -- 1. IVA Calculation Errors
    SELECT 
        doc_id,
        company_id,
        'Erro de Cálculo de IVA' as title,
        'Divergência detectada: (Total ' || total || ' - Imposto ' || tax || ') não corresponde à Base Tributável ' || base || '.' as message,
        jsonb_build_object('doc_id', doc_id, 'error_type', 'iva_math', 'total', total, 'tax', tax, 'base', base) as metadata
    FROM fiscal_docs
    WHERE abs((total - tax) - base) > 1
    
    UNION ALL
    
    -- 2. NIF Errors
    SELECT 
        doc_id,
        company_id,
        'NIF Inválido' as title,
        'O NIF do emitente (' || issuer_nif || ') não possui os 10 dígitos obrigatórios para entidades angolanas.' as message,
        jsonb_build_object('doc_id', doc_id, 'error_type', 'nif_invalid', 'nif', issuer_nif) as metadata
    FROM fiscal_docs
    WHERE length(issuer_nif) > 0 AND length(issuer_nif) <> 10

    UNION ALL

    -- 3. Invoices Older than 90 Days (VAT Deduction Window in Angola)
    SELECT 
        id as doc_id,
        company_id,
        'Prazo de Dedução Excedido' as title,
        'Documento datado de ' || (data ->> 'date') || ' excede o prazo de 90 dias para dedução de IVA (Art. 18.º CIVA).' as message,
        jsonb_build_object('doc_id', id, 'error_type', 'date_window_exceeded', 'date', data ->> 'date') as metadata
    FROM documents
    WHERE data ->> 'date' IS NOT NULL 
    AND (data ->> 'date')::date < CURRENT_DATE - INTERVAL '90 days'

    UNION ALL

    -- 4. Future Dates
    SELECT 
        id as doc_id,
        company_id,
        'Data Futura Detectada' as title,
        'O documento possui data de ' || (data ->> 'date') || ', o que indica erro de processamento ou fraude.' as message,
        jsonb_build_object('doc_id', id, 'error_type', 'future_date', 'date', data ->> 'date') as metadata
    FROM documents
    WHERE data ->> 'date' IS NOT NULL 
    AND (data ->> 'date')::date > CURRENT_DATE + INTERVAL '1 day'

    UNION ALL

    -- 5. Duplicate Document Detection
    SELECT 
        d1.id as doc_id,
        d1.company_id,
        'Documento Duplicado' as title,
        'Possível duplicata: Outro documento com mesmo NIF (' || (d1.data -> 'issuer_data' ->> 'nif') || '), data e valor já existe.' as message,
        jsonb_build_object('doc_id', d1.id, 'error_type', 'duplicate_doc', 'duplicate_of', d2.id) as metadata
    FROM documents d1
    JOIN documents d2 ON d1.company_id = d2.company_id 
        AND d1.id < d2.id
        AND (d1.data -> 'issuer_data' ->> 'nif') = (d2.data -> 'issuer_data' ->> 'nif')
        AND (d1.data ->> 'date') = (d2.data ->> 'date')
        AND (d1.data ->> 'totalAmount') = (d2.data ->> 'totalAmount')
    WHERE d1.data IS NOT NULL AND d2.data IS NOT NULL
)
INSERT INTO ai_alerts (agent_name, severity, title, message, metadata, company_id)
SELECT 
    'Sentinel', 
    'CRITICAL', 
    e.title, 
    e.message, 
    e.metadata, 
    e.company_id
FROM errors e
WHERE NOT EXISTS (
    SELECT 1 FROM ai_alerts a 
    WHERE a.agent_name = 'Sentinel' 
    AND a.metadata ->> 'doc_id' = e.doc_id::text
    AND a.metadata ->> 'error_type' = e.metadata ->> 'error_type'
)
RETURNING metadata ->> 'doc_id' as affected_doc;
