import { executeQuery } from '../database/postgres.client.js';
const OPERATIONAL_COSTS_SCHEMA = `
-- Tabela de Custos Operacionais
CREATE TABLE IF NOT EXISTS operational_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('AI_API', 'STORAGE', 'COMPUTE', 'SUPPORT', 'INFRASTRUCTURE')),
    cost_per_unit DECIMAL(10,6) NOT NULL CHECK (cost_per_unit >= 0),
    unit_name VARCHAR(20) NOT NULL,
    effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_operational_costs_type ON operational_costs(resource_type);
CREATE INDEX IF NOT EXISTS idx_operational_costs_effective ON operational_costs(effective_from, effective_until);

-- Inserir custos iniciais (valores exemplo - ajustar conforme realidade)
INSERT INTO operational_costs (resource_type, cost_per_unit, unit_name, notes) VALUES
    ('AI_API', 0.002500, 'token', 'Custo médio Gemini 2.0 Flash por 1k tokens'),
    ('STORAGE', 0.000100, 'MB', 'Custo de armazenamento por MB/mês'),
    ('COMPUTE', 0.050000, 'hour', 'Custo de processamento por hora de CPU'),
    ('SUPPORT', 500.000000, 'ticket', 'Custo médio de atendimento de suporte')
ON CONFLICT DO NOTHING;
`;
export async function runCreateOperationalCostsTableMigration() {
    console.log('🔧 Executando migração: Criação da tabela operational_costs (Fase 47)...');
    try {
        const statements = OPERATIONAL_COSTS_SCHEMA.split(';').filter(s => s.trim().length > 0);
        for (const stmt of statements) {
            const trimmed = stmt.trim();
            if (trimmed) {
                await executeQuery(trimmed + ';');
            }
        }
        console.log('✅ Tabela operational_costs criada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de operational_costs:', err);
        throw err;
    }
}
