
-- Lógica de Resolução de Alertas (Compliance Angola)
-- Parâmetros esperados: :alert_id, :action_type

DO $$
DECLARE
    v_doc_id UUID;
    v_alert_id UUID := '00000000-0000-0000-0000-000000000000'; -- Placeholder
    v_action TEXT := 'ACEITAR_RISCO'; -- Placeholder
BEGIN
    -- 1. Buscar o ID do documento a partir do alerta
    SELECT (metadata ->> 'doc_id')::UUID INTO v_doc_id
    FROM ai_alerts
    WHERE id = v_alert_id;

    IF v_doc_id IS NULL THEN
        RAISE EXCEPTION 'Documento não encontrado para o alerta %', v_alert_id;
    END IF;

    -- 2. Processar a Ação
    IF v_action = 'ACEITAR_RISCO' THEN
        -- Adiciona marcação de risco aceito no JSON de dados
        UPDATE documents 
        SET data = data || jsonb_build_object('risco_aceito', true, 'data_resolucao', NOW())
        WHERE id = v_doc_id;

    ELSIF v_action = 'RESOLVER_DUPLICADO' THEN
        -- Arquiva o documento duplicado
        UPDATE documents 
        SET status = 'ARQUIVADO', updated_at = NOW()
        WHERE id = v_doc_id;
    END IF;

    -- 3. Marcar Alerta como Resolvido
    UPDATE ai_alerts 
    SET is_resolved = true, 
        resolution_action = v_action,
        updated_at = NOW()
    WHERE id = v_alert_id;

END $$;
