import { executeQuery } from '../database/postgres.client.js';
const ADD_USER_PROMPTS_SQL = `
-- Adicionar coluna JSONB para prompts personalizados do usuário
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS agent_prompts JSONB DEFAULT '{}'::jsonb;
`;
export async function runAddUserPromptsMigration() {
    console.log('🔧 Executando migração: Adição de prompts personalizados à tabela users (Fase 17)...');
    try {
        await executeQuery(ADD_USER_PROMPTS_SQL);
        console.log('✅ Tabela users atualizada com coluna agent_prompts!');
    }
    catch (err) {
        console.error('❌ Erro na migração de prompts do usuário:', err);
        throw err;
    }
}
