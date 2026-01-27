import { executeQuery } from '../database/postgres.client.js';

const PLANS_SCHEMA_SQL = `
-- 1. Tabela de Planos
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    price_credits INTEGER NOT NULL DEFAULT 0,
    included_credits INTEGER NOT NULL DEFAULT 0,
    user_limit INTEGER NOT NULL DEFAULT 1,
    analysis_cost INTEGER NOT NULL DEFAULT 1,
    color VARCHAR(20) DEFAULT 'bg-slate-500',
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Inserir planos iniciais baseados no modelo atual (Valores em Créditos)
INSERT INTO plans (name, price_credits, included_credits, user_limit, analysis_cost, color, features) VALUES
    ('FREE', 0, 10, 1, 1, 'bg-slate-500', '["Análise básica", "1 Utilizador", "Suporte Comunitário"]'),
    ('STARTER', 15, 100, 3, 1, 'bg-blue-500', '["100 Créditos inclusos", "3 Utilizadores", "Suporte Standard"]'),
    ('PRO', 85, 500, 10, 1, 'bg-amber-500', '["500 Créditos inclusos", "10 Utilizadores", "Suporte Prioritário", "Análise de Fraude"]'),
    ('BUSINESS', 150, 1500, 25, 1, 'bg-emerald-500', '["1500 Créditos inclusos", "25 Utilizadores", "Suporte 24/7", "Relatórios Customizados"]'),
    ('ENTERPRISE', 500, 10000, 100, 1, 'bg-purple-500', '["Créditos Customizados", "Utilizadores Ilimitados", "SLA Garantido", "API Access"]')
ON CONFLICT (name) DO UPDATE SET
    price_credits = EXCLUDED.price_credits,
    included_credits = EXCLUDED.included_credits,
    user_limit = EXCLUDED.user_limit,
    color = EXCLUDED.color,
    features = EXCLUDED.features;

-- 3. Adicionar colunas de limites à tabela de usuários (caso não existam)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS monthly_credit_limit INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_month_consumption INTEGER DEFAULT 0;

-- 4. Adicionar coluna de plano_id às empresas para normalização futura
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id);

-- 5. Vincular empresas aos planos existentes baseado no nome do plano
UPDATE public.companies c
SET plan_id = p.id
FROM plans p
WHERE UPPER(c.plan) = p.name OR (c.plan IS NULL AND p.name = 'FREE');
`;

export async function runCreatePlansTableMigration() {
    console.log('🔧 Executando migração: Criação da tabela de planos e limites (Fase 44)...');
    try {
        const statements = PLANS_SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Infraestrutura de planos e limites pronta!');
    } catch (err) {
        console.error('❌ Erro na migração de planos:', err);
        throw err;
    }
}
