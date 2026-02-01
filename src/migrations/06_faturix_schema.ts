import { executeQuery } from '../database/postgres.client.js';

const FATURIX_SCHEMA_SQL = `
-- Tabela de Auditorias do Faturix
CREATE TABLE IF NOT EXISTS public.faturix_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    doc_type TEXT,
    status TEXT NOT NULL, -- aprovado, rejeitado, revisao, pendente, nao_suportado, aprovado_manual
    summary TEXT,
    insights JSONB DEFAULT '[]',
    causes JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    fiscal_data JSONB DEFAULT '{}',
    visual_quality JSONB DEFAULT '{}',
    fraud_analysis JSONB DEFAULT '{}',
    raw_response JSONB,
    decision_source TEXT DEFAULT 'agent', -- agent, manual
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de Regras do Faturix
CREATE TABLE IF NOT EXISTS public.faturix_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- Regras podem ser globais ou por admin
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- Fiscal, Segurança, Matemático, Conformidade
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    rigor TEXT DEFAULT 'Médio', -- Baixo, Médio, Alto
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de Configurações/Prompts do Agente Faturix
CREATE TABLE IF NOT EXISTS public.faturix_agent_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    agent_instructions TEXT,
    decision_criteria TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inserir regras padrão se não existirem
INSERT INTO public.faturix_rules (name, category, description, rigor)
SELECT 'Validação NIF AGT', 'Fiscal', 'Verifica se o NIF do emitente é válido no portal da AGT.', 'Alto'
WHERE NOT EXISTS (SELECT 1 FROM public.faturix_rules WHERE name = 'Validação NIF AGT');

INSERT INTO public.faturix_rules (name, category, description, rigor)
SELECT 'Cálculo de IVA (14%)', 'Matemático', 'Recalcula o somatório do IVA baseando-se nos itens.', 'Alto'
WHERE NOT EXISTS (SELECT 1 FROM public.faturix_rules WHERE name = 'Cálculo de IVA (14%)');
`;

export async function runFaturixMigration() {
    console.log('🔧 Executando migração do módulo Faturix (Fase 6)...\n');

    try {
        const statements = FATURIX_SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);

        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }

        console.log('✅ Tabelas do Faturix criadas com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração do Faturix:', err);
        throw err;
    }
}
