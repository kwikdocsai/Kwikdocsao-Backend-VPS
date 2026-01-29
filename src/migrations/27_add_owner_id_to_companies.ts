import { executeQuery } from '../database/postgres.client.js';

const ADD_OWNER_ID_SQL = `
-- Adicionar coluna owner_id à tabela companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_owner ON public.companies(owner_id);
`;

export async function runAddOwnerIdToCompaniesMigration() {
    console.log('🔧 Executando migração: Adição de owner_id à tabela companies (Fase 27)...');

    try {
        const statements = ADD_OWNER_ID_SQL.split(';').filter(s => s.trim().length > 0);

        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }

        console.log('✅ Tabela companies atualizada com owner_id!');
    } catch (err) {
        console.error('❌ Erro na migração de owner_id companies:', err);
        throw err;
    }
}
