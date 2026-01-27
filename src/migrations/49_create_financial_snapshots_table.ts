import { executeQuery } from '../database/postgres.client.js';

const FINANCIAL_SNAPSHOTS_SCHEMA = `
-- Tabela de Snapshots Financeiros Mensais
CREATE TABLE IF NOT EXISTS financial_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_month DATE NOT NULL UNIQUE,
    mrr DECIMAL(12,2) DEFAULT 0,
    arr DECIMAL(12,2) DEFAULT 0,
    total_companies INTEGER DEFAULT 0,
    active_companies INTEGER DEFAULT 0,
    churned_companies INTEGER DEFAULT 0,
    churn_rate DECIMAL(5,2) DEFAULT 0,
    new_companies INTEGER DEFAULT 0,
    total_credits_sold INTEGER DEFAULT 0,
    total_credits_consumed INTEGER DEFAULT 0,
    avg_credits_per_company DECIMAL(10,2) DEFAULT 0,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_operational_cost DECIMAL(12,2) DEFAULT 0,
    gross_margin DECIMAL(12,2) DEFAULT 0,
    gross_margin_percentage DECIMAL(5,2) DEFAULT 0,
    total_analyses INTEGER DEFAULT 0,
    avg_margin_per_analysis DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_snapshots_month ON financial_snapshots(snapshot_month DESC);

-- Comentários
COMMENT ON TABLE financial_snapshots IS 'Snapshots mensais de métricas financeiras para análise histórica e previsões';
COMMENT ON COLUMN financial_snapshots.snapshot_month IS 'Primeiro dia do mês de referência';
COMMENT ON COLUMN financial_snapshots.mrr IS 'Monthly Recurring Revenue';
COMMENT ON COLUMN financial_snapshots.arr IS 'Annual Recurring Revenue (MRR × 12)';
COMMENT ON COLUMN financial_snapshots.churn_rate IS 'Taxa de cancelamento mensal (%)';
COMMENT ON COLUMN financial_snapshots.gross_margin_percentage IS 'Margem bruta após custos operacionais (%)';
`;

export async function runCreateFinancialSnapshotsTableMigration() {
    console.log('🔧 Executando migração: Criação da tabela financial_snapshots (Fase 49)...');
    try {
        const statements = FINANCIAL_SNAPSHOTS_SCHEMA.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabela financial_snapshots criada com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração de financial_snapshots:', err);
        throw err;
    }
}
