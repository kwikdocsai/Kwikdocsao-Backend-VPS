import { executeQuery } from '../database/postgres.client.js';
const PERMISSIONS_SCHEMA_SQL = `
-- Adicionar novas colunas para controle fino de acesso e limites
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"finance": true, "legal": true, "lgt": true, "payments": true, "risk": true, "analytics": true, "reports": true, "accounting": true, "inventory": true, "admin": true}',
ADD COLUMN IF NOT EXISTS usage_limits JSONB DEFAULT '{"daily": {}, "monthly": {}}';

-- Garantir que o campo role tenha um valor padrão e atualizar os existentes
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'admin';
UPDATE public.users SET role = 'admin' WHERE role IS NULL;
UPDATE public.users SET role = 'COLLABORATOR' WHERE owner_id IS NOT NULL;
`;
export async function runPermissionsMigration() {
    console.log('🔧 Executando migração de permissões e limites...\n');
    try {
        const statements = PERMISSIONS_SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Colunas de permissões e limites adicionadas com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de permissões:', err);
        throw err;
    }
}
