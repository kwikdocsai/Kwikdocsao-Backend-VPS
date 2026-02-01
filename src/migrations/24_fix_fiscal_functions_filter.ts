import { executeQuery } from '../database/postgres.client.js';

const sql = `
-- 1. FIX: fn_get_fiscal_distribution (Handle NULL p_company_id as ALL)
CREATE OR REPLACE FUNCTION fn_get_fiscal_distribution(
    p_company_id UUID, 
    p_start_date TIMESTAMP WITH TIME ZONE, 
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    WITH filtered_docs AS (
        SELECT 
            COALESCE(data->'issuer_data'->>'name', data->>'merchantName', 'Desconhecido') as merchant,
            COALESCE(type, 'Outros') as category,
            COALESCE(valor_documento, 0) as amount
        FROM documents
        WHERE (p_company_id IS NULL OR company_id = p_company_id)
          AND created_at BETWEEN p_start_date AND p_end_date
          AND status IN ('COMPLETED', 'APROVADO')
    ),
    top_suppliers AS (
        SELECT merchant as name, SUM(amount) as value
        FROM filtered_docs
        GROUP BY merchant
        ORDER BY value DESC
        LIMIT 5
    ),
    categories AS (
        SELECT category as name, SUM(amount) as value
        FROM filtered_docs
        GROUP BY category
        ORDER BY value DESC
    )
    SELECT json_build_object(
        'top_suppliers', (SELECT COALESCE(json_agg(ts), '[]'::json) FROM top_suppliers ts),
        'spending_categories', (SELECT COALESCE(json_agg(cat), '[]'::json) FROM categories cat)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 2. FIX: fn_generate_vat_map (Handle NULL p_company_id as ALL)
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
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
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
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
    AND TO_CHAR(created_at, 'YYYY-MM') = p_month;

    -- 4. Retornar JSON Consolidado
    RETURN jsonb_build_object(
        'sumario', v_summary,
        'documentos', COALESCE(v_details, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql;

-- 3. FIX: fn_get_tax_position (Handle NULL p_company_id as ALL)
CREATE OR REPLACE FUNCTION fn_get_tax_position(
    p_company_id UUID, 
    p_period TEXT -- Formato: 'YYYY-MM'
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
    v_company_nif TEXT;
BEGIN
    -- Obter o NIF da empresa para comparação (apenas se p_company_id não for NULL)
    IF p_company_id IS NOT NULL THEN
        SELECT nif INTO v_company_nif FROM companies WHERE id = p_company_id;
    END IF;

    WITH base_data AS (
        SELECT 
            d.id,
            d.file_name as doc_name,
            -- Heurística para tipo: se NIF do emissor = NIF da empresa, é SAIDA
            CASE 
                WHEN d.type = 'SAIDA' THEN 'SAIDA'
                WHEN d.type = 'ENTRADA' THEN 'ENTRADA'
                WHEN v_company_nif IS NOT NULL AND COALESCE(d.data->>'merchantTaxId', d.data->'issuer_data'->>'nif') = v_company_nif THEN 'SAIDA'
                ELSE 'ENTRADA' -- Default para INVOICE ou NULL
            END as final_type,
            d.status,
            COALESCE((d.data->>'totalAmount')::numeric, 0) as amount,
            -- Fallback para 14% se taxAmount for nulo
            COALESCE(
                (d.data->>'taxAmount')::numeric, 
                COALESCE((d.data->>'totalAmount')::numeric, 0) * 0.14
            ) as tax,
            COALESCE((d.data->>'fiscal_retention_amount')::numeric, 0) as retention,
            (d.status = 'APROVADO_USUARIO') as is_human_approved,
            (d.status IN ('COMPLETED', 'APROVADO', 'SUCCESS', 'DONE')) as is_ai_approved,
            d.created_at
        FROM documents d
        WHERE (p_company_id IS NULL OR d.company_id = p_company_id)
          AND TO_CHAR(d.created_at, 'YYYY-MM') = p_period
          AND d.status IN ('COMPLETED', 'APROVADO', 'APROVADO_USUARIO', 'SUCCESS', 'DONE', 'REJEITADO')
    ),
    tax_summary AS (
        SELECT 
            COALESCE(SUM(amount) FILTER (WHERE final_type = 'ENTRADA'), 0) as b_entrada,
            COALESCE(SUM(tax) FILTER (WHERE final_type = 'ENTRADA'), 0) as i_dedutivel,
            COALESCE(SUM(amount) FILTER (WHERE final_type = 'SAIDA'), 0) as b_saida,
            COALESCE(SUM(tax) FILTER (WHERE final_type = 'SAIDA'), 0) as i_liquidado,
            COALESCE(SUM(retention), 0) as r_estimada
        FROM base_data
    ),
    doc_details AS (
        SELECT json_agg(
            json_build_object(
                'document_id', id,
                'document_name', doc_name,
                'taxable_base', amount,
                'tax_amount', tax,
                'type', final_type,
                'ai_status', CASE WHEN is_ai_approved THEN 'APROVADO' ELSE 'PENDENTE' END,
                'human_status', CASE WHEN status = 'APROVADO_USUARIO' THEN 'APROVADO' 
                                     WHEN status = 'REJEITADO' THEN 'REJEITADO'
                                     ELSE 'PENDENTE' END,
                'fiscal_month', SPLIT_PART(p_period, '-', 2),
                'fiscal_year', SPLIT_PART(p_period, '-', 1)
            )
        ) as details
        FROM base_data
    )
    SELECT json_build_object(
        'resumo', json_build_object(
            'base_entrada', total_base.b_entrada,
            'base_saida', total_base.b_saida,
            'iva_dedutivel', total_base.i_dedutivel,
            'iva_liquidado', total_base.i_liquidado,
            'saldo_iva', total_base.i_liquidado - total_base.i_dedutivel,
            'retencao_estimada', total_base.r_estimada
        ),
        'detalhes', COALESCE(doc_details.details, '[]'::json)
    ) INTO v_result
    FROM tax_summary total_base, doc_details;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
`;

export const runFixFiscalFunctionsFilterMigration = async () => {
    try {
        console.log('Running migration: Fix Fiscal Functions Filters...');
        await executeQuery(sql);
        console.log('Migration completed: Fiscal functions updated to handle NULL company_id.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
};
