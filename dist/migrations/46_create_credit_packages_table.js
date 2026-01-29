import { executeQuery } from '../database/postgres.client.js';
const CREDIT_PACKAGES_SCHEMA = `
-- Tabela de Pacotes de Créditos Avulsos
CREATE TABLE IF NOT EXISTS credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0),
    price DECIMAL(12,2) NOT NULL CHECK (price >= 0),
    bonus_credits INTEGER DEFAULT 0 CHECK (bonus_credits >= 0),
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(20) DEFAULT 'bg-blue-500',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_credit_packages_active ON credit_packages(is_active);

-- Inserir pacotes iniciais
INSERT INTO credit_packages (name, credits, price, bonus_credits, color, description) VALUES
    ('STARTER', 100, 5000, 0, 'bg-blue-500', 'Pacote inicial para testes'),
    ('PRO', 500, 20000, 50, 'bg-amber-500', 'Pacote profissional com 10% de bónus'),
    ('MEGA', 2000, 70000, 300, 'bg-emerald-500', 'Pacote empresarial com 15% de bónus'),
    ('ULTRA', 5000, 150000, 1000, 'bg-purple-500', 'Pacote premium com 20% de bónus')
ON CONFLICT DO NOTHING;
`;
export async function runCreateCreditPackagesTableMigration() {
    console.log('🔧 Executando migração: Criação da tabela credit_packages (Fase 46)...');
    try {
        const statements = CREDIT_PACKAGES_SCHEMA.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabela credit_packages criada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de credit_packages:', err);
        throw err;
    }
}
