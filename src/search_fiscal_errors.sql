
-- Exemplo de Busca Filtrada (Lógica de Backend)
-- Filtros: Vendor = 'ARG', Agent = 'Sentinel', Severity = 'CRITICAL'

SELECT * 
FROM view_grouped_fiscal_errors
WHERE 1=1
-- Filtro por Fornecedor (Case Insensitive)
AND vendor_name ILIKE '%ARG%'
-- Filtro por Agente (Verifica se está no array de envolvidos)
AND 'Sentinel' = ANY(involved_agents)
-- Filtro por Severidade Máxima
AND peak_severity = 'CRITICAL'
-- Ordenação por Prioridade (Mais erros primeiro, depois mais recentes)
ORDER BY error_count DESC, last_detected_at DESC;
