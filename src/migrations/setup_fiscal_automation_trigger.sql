
-- Automação Fiscal: Trigger de Auditoria em Tempo Real
-- Detecta erros comuns no momento da inserção e popula ai_alerts

CREATE OR REPLACE FUNCTION fn_auto_detect_fiscal_errors()
RETURNS TRIGGER AS $$
DECLARE
    v_total numeric;
    v_tax numeric;
    v_base numeric;
    v_invoice_no text;
BEGIN
    -- Extração de dados do JSONB com segurança
    v_total := (NEW.data ->> 'totalAmount')::numeric;
    v_tax := (NEW.data ->> 'taxAmount')::numeric;
    v_base := (NEW.data ->> 'baseAmount')::numeric;
    v_invoice_no := (NEW.data ->> 'invoiceNo');

    -- 1. Verificação de Integridade de IVA (Sentinel - CRITICAL)
    -- Tolerância de 1 Kz para arredondamentos
    IF ABS(COALESCE(v_tax, 0) + COALESCE(v_base, 0) - COALESCE(v_total, 0)) > 1.0 THEN
        INSERT INTO ai_alerts (
            company_id, 
            document_id,
            agent_name, 
            severity, 
            title, 
            message, 
            metadata,
            is_resolved
        ) VALUES (
            NEW.company_id,
            NEW.id,
            'Sentinel',
            'CRITICAL',
            'Erro de Cálculo de IVA',
            'A soma da Base Tributável (' || COALESCE(v_base, 0) || ') e do Imposto (' || COALESCE(v_tax, 0) || ') não coincide com o Total (' || COALESCE(v_total, 0) || ').',
            jsonb_build_object('doc_id', NEW.id, 'error_type', 'VAT_MISMATCH'),
            false
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- 2. Verificação de Conformidade SAFT-AO (Watchdog - WARNING)
    IF v_invoice_no IS NULL OR v_invoice_no = '' THEN
        INSERT INTO ai_alerts (
            company_id, 
            document_id,
            agent_name, 
            severity, 
            title, 
            message, 
            metadata,
            is_resolved
        ) VALUES (
            NEW.company_id,
            NEW.id,
            'Watchdog',
            'WARNING',
            'Número de Fatura Ausente',
            'Documento processado sem número de fatura identificável. Requisito obrigatório para SAFT-AO.',
            jsonb_build_object('doc_id', NEW.id, 'error_type', 'MISSING_INVOICE_NO'),
            false
        ) ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger disparado após inserção de documentos com status ERROR
DROP TRIGGER IF EXISTS trg_documents_audit_on_error ON documents;
CREATE TRIGGER trg_documents_audit_on_error
AFTER INSERT ON documents
FOR EACH ROW
WHEN (NEW.status = 'ERROR')
EXECUTE FUNCTION fn_auto_detect_fiscal_errors();

COMMENT ON FUNCTION fn_auto_detect_fiscal_errors() IS 'Automação para detecção imediata de erros fiscais em Angola';
