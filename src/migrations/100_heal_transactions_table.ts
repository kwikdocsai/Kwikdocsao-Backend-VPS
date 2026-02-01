
import { executeQuery } from '../database/postgres.client.js';

const HEAL_SQL = `
-- Garantir colunas essenciais na tabela transactions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED',
ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS plan_name TEXT,
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'AOA';

-- Garantir que as colunas existentes aceitam nulos se necessário
ALTER TABLE public.transactions ALTER COLUMN plan_name DROP NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN amount DROP NOT NULL;
`;

export async function runHealTransactionsMigration() {
    console.log('🔧 Executando migração: Cura da tabela transactions (Fase 100)...');
    try {
        await executeQuery(HEAL_SQL);
        console.log('✅ Tabela transactions curada com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração de cura de transações:', err);
        throw err;
    }
}
