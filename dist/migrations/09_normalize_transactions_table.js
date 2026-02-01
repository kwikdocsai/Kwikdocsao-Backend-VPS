import { executeQuery } from '../database/postgres.client.js';
export async function runNormalizeTransactionsMigration() {
    console.log('🔧 Executando migração: Normalização da tabela transactions...');
    try {
        // Garantir que a tabela existe
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS public.transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
        `);
        // Adicionar colunas em falta para alinhar com o uso no server.ts e MCP
        await executeQuery(`
            ALTER TABLE transactions 
            ADD COLUMN IF NOT EXISTS company_id UUID,
            ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS type TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED',
            ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'SYSTEM',
            ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'AOA';
        `);
        // Tornar plan_name opcional para evitar erros de constraint
        try {
            await executeQuery('ALTER TABLE transactions ALTER COLUMN plan_name DROP NOT NULL;');
        }
        catch (e) {
            console.log('ℹ️ Coluna plan_name pode não existir ainda em transactions.');
        }
        // Tentar linkar company_id se a tabela companies existir
        try {
            await executeQuery('ALTER TABLE transactions ADD CONSTRAINT fk_transactions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;');
        }
        catch (e) {
            console.log('ℹ️ Constraint de companhia não adicionada em transactions (pode já existir ou tabela companies ausente).');
        }
        console.log('✅ Tabela transactions normalizada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de normalização de transações:', err);
        throw err;
    }
}
