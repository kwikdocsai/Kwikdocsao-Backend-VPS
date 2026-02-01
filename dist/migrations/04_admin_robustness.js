import { executeQuery } from '../database/postgres.client.js';
const ADMIN_ROBUSTNESS_SQL = `
-- Tabela de Convites de Equipe
CREATE TABLE IF NOT EXISTS public.team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    member_email TEXT NOT NULL,
    member_name TEXT,
    status TEXT DEFAULT 'pending', -- pending, accepted, expired
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days')
);

-- Tabela de Transações de Crédito (Top-ups e Upgrades)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'topup', 'upgrade', 'bonus'
    plan_before TEXT,
    plan_after TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ajustar a tabela de usuários para garantir que role e is_active sejam consistentes
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
`;
export async function runAdminRobustnessMigration() {
    console.log('🔧 Executando migração de robustez administrativa (Fase 4)...\n');
    try {
        const statements = ADMIN_ROBUSTNESS_SQL.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabelas de convites e transações criadas com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de robustez:', err);
        throw err;
    }
}
