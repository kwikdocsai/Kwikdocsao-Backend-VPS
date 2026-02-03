
import { executeQuery } from './database/postgres.client.js';

const sql = `
-- Função para obter a posição fiscal detalhada (IVA a Pagar/Recuperar e Retenções)
CREATE OR REPLACE FUNCTION fn_get_tax_position(
    p_company_id UUID, 
    p_period TEXT -- Formato: 'YYYY-MM'
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
    v_company_nif TEXT;
BEGIN
    -- Obter o NIF da empresa para comparação
    SELECT nif INTO v_company_nif FROM companies WHERE id = p_company_id;

    WITH base_data AS (
        SELECT 
            d.id,
            d."fileName" as doc_name,
            -- Heurística para tipo: se NIF do emissor = NIF da empresa, é SAIDA
            CASE 
                WHEN d.type = 'SAIDA' THEN 'SAIDA'
                WHEN d.type = 'ENTRADA' THEN 'ENTRADA'
                WHEN COALESCE(d.data->>'merchantTaxId', d.data->'issuer_data'->>'nif') = v_company_nif THEN 'SAIDA'
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
        WHERE d.company_id = p_company_id
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

async function migrate() {
    try {
        console.log('Deploying fn_get_tax_position...');
        await executeQuery(sql);
        console.log('Migration successful!');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
