import { executeQuery } from '../database/postgres.client.js';
export async function runAddRetentionAndVatProcMigration() {
    console.log('🔧 Executando migração: Adicionando valor_retencao e procedure de Mapa de IVA...');
    try {
        // 1. Adicionar coluna valor_retencao à tabela documents
        await executeQuery(`
            ALTER TABLE public.documents 
            ADD COLUMN IF NOT EXISTS valor_retencao NUMERIC DEFAULT 0;
        `);
        // 2. Garantir que não haja nulos
        await executeQuery(`
            UPDATE public.documents SET 
                valor_retencao = COALESCE(valor_retencao, 0)
            WHERE valor_retencao IS NULL;
        `);
        // 3. Criar função fn_generate_vat_map
        await executeQuery(`
            CREATE OR REPLACE FUNCTION fn_generate_vat_map(p_company_id UUID, p_month TEXT)
            RETURNS JSONB AS $$
            DECLARE
                v_summary JSONB;
                v_details JSONB;
                v_iva_dedutivel numeric;
                v_iva_liquidado numeric;
                v_total_base numeric;
                v_total_retencao numeric;
            BEGIN
                -- 1. Calcular Totais do Resumo (Adicionado Retenção)
                SELECT 
                    SUM(COALESCE(valor_iva, 0)) FILTER (WHERE status_fiscal = 'CONFORME' AND tipo_movimento = 'SAIDA'),
                    SUM(COALESCE(valor_iva, 0)) FILTER (WHERE tipo_movimento = 'ENTRADA'),
                    SUM(COALESCE(valor_base, 0)),
                    SUM(COALESCE(valor_retencao, 0)) FILTER (WHERE tipo_movimento = 'ENTRADA')
                INTO v_iva_dedutivel, v_iva_liquidado, v_total_base, v_total_retencao
                FROM documents
                WHERE company_id = p_company_id 
                AND TO_CHAR(created_at, 'YYYY-MM') = p_month;

                -- 2. Construir Objeto de Resumo
                v_summary := jsonb_build_object(
                    'periodo', p_month,
                    'iva_dedutivel', COALESCE(v_iva_dedutivel, 0),
                    'iva_liquidado', COALESCE(v_iva_liquidado, 0),
                    'base_tributavel', COALESCE(v_total_base, 0),
                    'total_retencao', COALESCE(v_total_retencao, 0),
                    'posicao_liquida', COALESCE(v_iva_liquidado, 0) - COALESCE(v_iva_dedutivel, 0) - COALESCE(v_total_retencao, 0)
                );

                -- 3. Gerar Lista Detalhada de Documentos
                SELECT jsonb_agg(jsonb_build_object(
                    'id', id,
                    'data_emissao', created_at,
                    'fornecedor', COALESCE(data->'issuer_data'->>'name', data->>'merchantName'),
                    'nif', COALESCE(data->'issuer_data'->>'nif', data->>'merchantTaxId'),
                    'total', COALESCE(valor_documento, 0),
                    'iva', COALESCE(valor_iva, 0),
                    'retencao', COALESCE(valor_retencao, 0),
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
        `);
        console.log('✅ Migração de retenção e Mapa de IVA concluída!');
    }
    catch (err) {
        console.error('❌ Erro na migração add_retention_and_vat_proc:', err);
        throw err;
    }
}
