import { executeQuery } from '../database/postgres.client.js';
const MIGRATION_SQL = `
-- 1. Renomear coluna price para price_credits e mudar para INTEGER
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'price') THEN
        ALTER TABLE plans RENAME COLUMN price TO price_credits;
        ALTER TABLE plans ALTER COLUMN price_credits TYPE INTEGER USING price_credits::INTEGER;
    END IF;
END $$;

-- 2. Atualizar valores dos planos para créditos
UPDATE plans SET price_credits = 0 WHERE name = 'FREE';
UPDATE plans SET price_credits = 15 WHERE name = 'STARTER';
UPDATE plans SET price_credits = 85 WHERE name = 'PRO';
UPDATE plans SET price_credits = 150 WHERE name = 'BUSINESS';
UPDATE plans SET price_credits = 500 WHERE name = 'ENTERPRISE';

-- 3. Garantir que coloam price_credits existe caso a migração acima tenha falhado por algum motivo
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_credits INTEGER DEFAULT 0;
`;
export async function runPlansToCreditsMigration() {
    console.log('🔧 Executando migração: Refatoração de Planos para Créditos (Fase 55)...');
    try {
        await executeQuery(MIGRATION_SQL);
        console.log('✅ Tabela de planos atualizada para créditos!');
    }
    catch (err) {
        console.error('❌ Erro na migração de planos para créditos:', err);
        throw err;
    }
}
