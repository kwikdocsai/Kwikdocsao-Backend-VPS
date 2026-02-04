
-- Migração: Função de Distribuição Fiscal Otimizada
-- Retorna Fornecedores e Categorias em um único JSON para reduzir latência

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
        WHERE company_id = p_company_id
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

COMMENT ON FUNCTION fn_get_fiscal_distribution IS 'Agrega gastos por fornecedor e categoria para os gráficos da página de Relatórios.';
