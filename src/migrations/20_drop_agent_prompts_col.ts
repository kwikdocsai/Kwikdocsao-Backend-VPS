import { executeQuery } from '../database/postgres.client.js';

const DROP_AGENT_PROMPTS_SQL = `
-- Drop column agent_prompts if it exists, as we now use individual columns
ALTER TABLE public.users 
DROP COLUMN IF EXISTS agent_prompts;
`;

export async function runDropAgentPromptsMigration() {
    console.log('🔧 Executando migração: Remoção da coluna agent_prompts (Fase 20)...');

    try {
        await executeQuery(DROP_AGENT_PROMPTS_SQL);
        console.log('✅ Coluna agent_prompts removida com sucesso!');
    } catch (err) {
        console.error('❌ Erro na remoção da coluna agent_prompts:', err);
        throw err;
    }
}
