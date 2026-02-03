
-- Fiscal Backend: Procedimento de Geração de Mapa de IVA
-- Consolida impostos dedutíveis e liquidados para conformidade AGT

CREATE OR REPLACE FUNCTION fn_generate_vat_map(p_company_id UUID, p_month TEXT)
RETURNS JSONB AS $$
DECLARE
    v_summary JSONB;
    v_details JSONB;
    v_iva_dedutivel numeric;
    v_iva_liquidado numeric;
    v_total_base numeric;
BEGIN
    -- 1. Calcular Totais do Resumo
    SELECT 
        SUM(COALESCE(valor_iva, 0)) FILTER (WHERE status_fiscal = 'CONFORME' AND tipo_movimento = 'SAIDA'),
        SUM(COALESCE(valor_iva, 0)) FILTER (WHERE tipo_movimento = 'ENTRADA'),
        SUM(COALESCE(valor_base, 0))
    INTO v_iva_dedutivel, v_iva_liquidado, v_total_base
    FROM documents
    WHERE company_id = p_company_id 
    AND TO_CHAR(created_at, 'YYYY-MM') = p_month;

    -- 2. Construir Objeto de Resumo
    v_summary := jsonb_build_object(
        'periodo', p_month,
        'iva_dedutivel', COALESCE(v_iva_dedutivel, 0),
        'iva_liquidado', COALESCE(v_iva_liquidado, 0),
        'base_tributavel', COALESCE(v_total_base, 0),
        'posicao_liquida', COALESCE(v_iva_liquidado, 0) - COALESCE(v_iva_dedutivel, 0)
    );

    -- 3. Gerar Lista Detalhada de Documentos
    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'data_emissao', created_at,
        'fornecedor', COALESCE(data->'issuer_data'->>'name', data->>'merchantName'),
        'nif', COALESCE(data->'issuer_data'->>'nif', data->>'merchantTaxId'),
        'total', COALESCE(valor_documento, 0),
        'iva', COALESCE(valor_iva, 0),
        'status', status,
        'status_fiscal', status_fiscal,
        'tipo_movimento', tipo_movimento,
        'elegivel_deducao', (status_fiscal = 'CONFORME' AND tipo_movimento = 'SAIDA')
    ) ORDER BY created_at ASC)
    INTO v_details
    FROM documents
    WHERE company_id = p_company_id 
    AND TO_CHAR(created_at, 'YYYY-MM') = p_month;

    -- 4. Retornar JSON Consolidado
    RETURN jsonb_build_object(
        'sumario', v_summary,
        'documentos', COALESCE(v_details, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_generate_vat_map(UUID, TEXT) IS 'Gera o relatório detalhado de IVA para exportação e conformidade AGT.';
