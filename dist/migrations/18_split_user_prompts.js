import { executeQuery } from '../database/postgres.client.js';
const MIGRATE_USER_COLS_SQL = `
-- 1. Adicionar colunas individuais para prompts
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS auditor_prompt TEXT,
ADD COLUMN IF NOT EXISTS strategist_prompt TEXT,
ADD COLUMN IF NOT EXISTS rag_prompt TEXT,
ADD COLUMN IF NOT EXISTS analyzer_prompt TEXT,
ADD COLUMN IF NOT EXISTS vision_prompt TEXT;

-- 2. Adicionar flag de troca de senha obrigatória
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT TRUE;

-- 3. (Opcional) Migrar dados do JSONB antigo se existirem
UPDATE public.users
SET 
  auditor_prompt = agent_prompts->>'AUDITOR',
  strategist_prompt = agent_prompts->>'STRATEGIST',
  rag_prompt = agent_prompts->>'RAG',
  analyzer_prompt = agent_prompts->>'ANALYZER',
  vision_prompt = agent_prompts->>'VISION'
WHERE agent_prompts IS NOT NULL;
`;
export async function runSplitUserPromptsMigration() {
    console.log('🔧 Executando migração: Separação de prompts e atualização de segurança (Fase 18)...');
    try {
        await executeQuery(MIGRATE_USER_COLS_SQL);
        console.log('✅ Tabela users atualizada com novas colunas e dados migrados!');
    }
    catch (err) {
        console.error('❌ Erro na migração de colunas de usuário:', err);
        throw err;
    }
}
