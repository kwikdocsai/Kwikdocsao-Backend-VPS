import { executeQuery } from '../database/postgres.client.js';

const EXTENDED_COMPANY_FIELDS_SQL = `
-- Adicionar colunas em falta à tabela de empresas
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS fiscal_rep TEXT,
ADD COLUMN IF NOT EXISTS accountant_name TEXT,
ADD COLUMN IF NOT EXISTS accountant_email TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT;
`;

export async function runAddExtendedCompanyFieldsMigration() {
    console.log('🔧 Executando migração: Adição de campos estendidos à tabela companies (Fase 16)...');

    try {
        const statements = EXTENDED_COMPANY_FIELDS_SQL.split(';').filter(s => s.trim().length > 0);

        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }

        console.log('✅ Tabela companies atualizada com campos estendidos!');
    } catch (err) {
        console.error('❌ Erro na migração de campos estendidos:', err);
        throw err;
    }
}
