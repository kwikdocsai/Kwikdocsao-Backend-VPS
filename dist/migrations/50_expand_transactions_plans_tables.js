import { executeQuery } from '../database/postgres.client.js';
const EXPAND_SCHEMA = `
-- Expandir tabela transactions com campos financeiros
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES credit_packages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS operational_cost DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS margin DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Expandir tabela plans com campos de pricing avançado
ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS setup_fee DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS overage_cost_per_credit DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_commitment_months INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS discount_annual DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_users INTEGER,
ADD COLUMN IF NOT EXISTS support_level VARCHAR(20) DEFAULT 'STANDARD';

-- Índices adicionais
CREATE INDEX IF NOT EXISTS idx_transactions_package ON transactions(package_id);
CREATE INDEX IF NOT EXISTS idx_transactions_approved ON transactions(approved_by);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(is_active);

-- Comentários
COMMENT ON COLUMN transactions.package_id IS 'Referência ao pacote de créditos comprado (se aplicável)';
COMMENT ON COLUMN transactions.operational_cost IS 'Custo operacional estimado da transação';
COMMENT ON COLUMN transactions.margin IS 'Margem de lucro (amount - operational_cost)';
COMMENT ON COLUMN plans.overage_cost_per_credit IS 'Custo por crédito adicional após limite do plano';
COMMENT ON COLUMN plans.discount_annual IS 'Desconto percentual para pagamento anual';
`;
export async function runExpandTransactionsPlansTablesMigration() {
    console.log('🔧 Executando migração: Expansão de transactions e plans (Fase 50)...');
    try {
        const statements = EXPAND_SCHEMA.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabelas transactions e plans expandidas com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de expansão:', err);
        throw err;
    }
}
