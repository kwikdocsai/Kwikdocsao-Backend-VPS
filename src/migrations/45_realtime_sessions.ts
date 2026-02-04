
import { executeQuery } from '../database/postgres.client.js';

export async function runRealtimeSessionsMigration() {
    console.log('🔧 Executando migração: Rastreamento em Tempo Real e Sessões (Fase 45)...');

    try {
        // 1. Adicionar last_seen_at à tabela users
        await executeQuery(`
            ALTER TABLE public.users 
            ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;
        `);
        console.log('✅ Coluna last_seen_at adicionada à tabela users.');

        // 2. Garantir que a tabela user_sessions e suas colunas existem
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS public.user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid()
            );
        `);

        await executeQuery(`
            ALTER TABLE public.user_sessions 
            ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS user_agent TEXT,
            ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
        `);
        console.log('✅ Estrutura da tabela user_sessions verificada/atualizada.');

        // 3. Adicionar índices para performance de queries de tempo real
        await executeQuery(`
            CREATE INDEX IF NOT EXISTS idx_users_last_seen ON public.users(last_seen_at);
        `);

        await executeQuery(`
            CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.user_sessions(user_id) WHERE is_active = true;
        `);
        console.log('✅ Índices de performance criados.');

    } catch (err) {
        console.error('❌ Erro na migração realtime_sessions:', err);
        throw err;
    }
}
