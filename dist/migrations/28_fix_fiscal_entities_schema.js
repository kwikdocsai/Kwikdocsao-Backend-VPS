import { executeQuery } from '../database/postgres.client.js';
const ADD_ENTITY_TYPE_SQL = `
-- Adicionar coluna entity_type à tabela fiscal_entities
ALTER TABLE public.fiscal_entities 
ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'CLIENT';
`;
export async function runFixFiscalEntitiesSchemaMigration() {
    console.log('🔧 Executando migração: Correção de schema fiscal_entities (Fase 28)...');
    try {
        const statements = ADD_ENTITY_TYPE_SQL.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabela fiscal_entities atualizada com entity_type!');
    }
    catch (err) {
        console.error('❌ Erro na migração de fiscal_entities:', err);
        throw err;
    }
}
