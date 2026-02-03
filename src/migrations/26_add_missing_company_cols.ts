import { executeQuery } from '../database/postgres.client.js';

const ADD_COLS_SQL = `
-- Adicionar colunas em falta à tabela companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS company_type VARCHAR(50) DEFAULT 'PME',
ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(50) DEFAULT 'Geral',
ADD COLUMN IF NOT EXISTS main_activity TEXT;
`;

export async function runAddMissingCompanyColsMigration() {
    console.log('🔧 Executando migração: Adição de colunas em falta à tabela companies (Fase 26)...');

    try {
        const statements = ADD_COLS_SQL.split(';').filter(s => s.trim().length > 0);

        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }

        console.log('✅ Tabela companies atualizada com colunas em falta!');
    } catch (err) {
        console.error('❌ Erro na migração de colunas companies:', err);
        throw err;
    }
}
