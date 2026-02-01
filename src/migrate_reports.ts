
import { executeQuery } from './database/postgres.client.js';

const sql = `
-- 1. View de Análise Fiscal
CREATE OR REPLACE VIEW view_fiscal_analytics AS
SELECT 
    company_id,
    TO_CHAR(created_at, 'YYYY-MM') as mes_referencia,
    COALESCE(type, 'DESCONHECIDO') as categoria,
    SUM(COALESCE((data->>'totalAmount')::numeric, 0)) as volume_total,
    SUM(COALESCE(
        (data->>'taxAmount')::numeric, 
        COALESCE((data->>'totalAmount')::numeric, 0) * 0.14
    )) as iva_estimado,
    COUNT(*) as total_documentos,
    ROUND(
        (COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'APROVADO', 'SUCCESS', 'DONE', 'APROVADO_USUARIO'))::numeric / 
        NULLIF(COUNT(*), 0) * 100), 2
    ) as eficiencia_fiscal
FROM documents
GROUP BY company_id, mes_referencia, categoria;

-- 2. Função de Distribuição
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
            COALESCE(data->>'merchantName', 'Desconhecido') as merchant,
            COALESCE(data->>'category', 'Outros') as category,
            CAST(COALESCE(NULLIF(data->>'totalAmount', ''), '0') AS NUMERIC) as amount
        FROM documents
        WHERE company_id = p_company_id
          AND created_at BETWEEN p_start_date AND p_end_date
          AND status IN ('COMPLETED', 'APROVADO', 'APROVADO_USUARIO')
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

-- 3. Função de Mapa de IVA
CREATE OR REPLACE FUNCTION fn_generate_vat_map(p_company_id UUID, p_month TEXT)
RETURNS JSONB AS $$
DECLARE
    v_summary JSONB;
    v_details JSONB;
    v_iva_dedutivel numeric;
    v_iva_liquidado numeric;
    v_total_base numeric;
BEGIN
    SELECT 
        SUM(COALESCE((data->>'taxAmount')::numeric, 0)) FILTER (WHERE status IN ('APROVADO', 'COMPLETED', 'APROVADO_USUARIO') AND (data->'issuer_data'->>'nif' IS NOT NULL OR data->>'merchantTaxId' IS NOT NULL)),
        SUM(COALESCE((data->>'taxAmount')::numeric, 0)) FILTER (WHERE type = 'SAIDA'),
        SUM(COALESCE((data->>'baseAmount')::numeric, 0))
    INTO v_iva_dedutivel, v_iva_liquidado, v_total_base
    FROM documents
    WHERE company_id = p_company_id 
    AND TO_CHAR(created_at, 'YYYY-MM') = p_month;

    v_summary := jsonb_build_object(
        'periodo', p_month,
        'iva_dedutivel', COALESCE(v_iva_dedutivel, 0),
        'iva_liquidado', COALESCE(v_iva_liquidado, 0),
        'base_tributavel', COALESCE(v_total_base, 0),
        'posicao_liquida', COALESCE(v_iva_liquidado, 0) - COALESCE(v_iva_dedutivel, 0)
    );

    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'data_emissao', created_at,
        'fornecedor', COALESCE(data->'issuer_data'->>'name', data->>'merchantName'),
        'nif', COALESCE(data->'issuer_data'->>'nif', data->>'merchantTaxId'),
        'total', (data->>'totalAmount')::numeric,
        'iva', (data->>'taxAmount')::numeric,
        'status', status,
        'elegivel_deducao', (status IN ('APROVADO', 'COMPLETED', 'APROVADO_USUARIO') AND (data->'issuer_data'->>'nif' IS NOT NULL OR data->>'merchantTaxId' IS NOT NULL))
    ) ORDER BY created_at ASC)
    INTO v_details
    FROM documents
    WHERE company_id = p_company_id 
    AND TO_CHAR(created_at, 'YYYY-MM') = p_month;

    RETURN jsonb_build_object(
        'sumario', v_summary,
        'documentos', COALESCE(v_details, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql;
`;

async function migrate() {
    try {
        console.log('Running SQL Migration...');
        await executeQuery(sql);
        console.log('Migration completed successfully!');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
