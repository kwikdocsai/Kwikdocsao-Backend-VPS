import { executeQuery } from '../database/postgres.client.js';
const ANALYSIS_COSTS_SCHEMA = `
-- Tabela de Custos por Análise (Rastreamento de Rentabilidade)
CREATE TABLE IF NOT EXISTS analysis_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    credits_charged INTEGER NOT NULL DEFAULT 1,
    ai_tokens_used INTEGER DEFAULT 0,
    ai_cost_aoa DECIMAL(10,4) DEFAULT 0,
    storage_cost_aoa DECIMAL(10,4) DEFAULT 0,
    compute_cost_aoa DECIMAL(10,4) DEFAULT 0,
    total_operational_cost_aoa DECIMAL(10,4) DEFAULT 0,
    revenue_aoa DECIMAL(10,4) DEFAULT 0,
    margin_aoa DECIMAL(10,4) DEFAULT 0,
    margin_percentage DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_analysis_costs_document ON analysis_costs(document_id);
CREATE INDEX IF NOT EXISTS idx_analysis_costs_company ON analysis_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_analysis_costs_created ON analysis_costs(created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_costs_margin ON analysis_costs(margin_percentage);

-- Comentários
COMMENT ON TABLE analysis_costs IS 'Rastreamento de custos operacionais e margem de lucro por análise de documento';
COMMENT ON COLUMN analysis_costs.credits_charged IS 'Créditos debitados do cliente';
COMMENT ON COLUMN analysis_costs.ai_tokens_used IS 'Tokens consumidos da API Gemini';
COMMENT ON COLUMN analysis_costs.revenue_aoa IS 'Receita gerada (créditos × valor unitário)';
COMMENT ON COLUMN analysis_costs.margin_aoa IS 'Lucro líquido (receita - custos operacionais)';
`;
export async function runCreateAnalysisCostsTableMigration() {
    console.log('🔧 Executando migração: Criação da tabela analysis_costs (Fase 48)...');
    try {
        const statements = ANALYSIS_COSTS_SCHEMA.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabela analysis_costs criada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de analysis_costs:', err);
        throw err;
    }
}
