import { executeQuery } from '../database/postgres.client.js';
const SCHEMA_SQL = `
-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS (já existe, mas garantir estrutura)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    company TEXT,
    role VARCHAR(20) DEFAULT 'user',
    plan VARCHAR(20) DEFAULT 'free',
    credits INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);
-- Adicionar colunas se não existirem (para tabelas já criadas)
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 10;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. DOCUMENTS (documentos analisados)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by UUID REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type VARCHAR(50),
    doc_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    analysis_result JSONB,
    confidence DECIMAL(5,2),
    file_content TEXT,
    mime_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Adicionar colunas se não existirem (para migrações futuras)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_content TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);


-- 3. TRANSACTIONS (pagamentos)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_name VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(5) DEFAULT 'AOA',
    status VARCHAR(20) DEFAULT 'pending',
    proof_url TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- 4. TEAM_MEMBERS (multi-tenancy)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    member_email TEXT NOT NULL,
    member_name TEXT,
    role VARCHAR(20) DEFAULT 'viewer',
    status VARCHAR(20) DEFAULT 'pending',
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_team_owner ON team_members(owner_id);

-- 5. AUDIT_LOGS (auditoria)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);

-- 6. INVOICES (faturas emitidas)
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invoice_number TEXT,
    customer_name TEXT NOT NULL,
    customer_nif VARCHAR(20),
    customer_address TEXT,
    customer_contact TEXT,
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_total DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    currency VARCHAR(5) DEFAULT 'AOA',
    status VARCHAR(20) DEFAULT 'draft',
    issued_at TIMESTAMP,
    due_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- 7. INVOICE_ITEMS (itens das faturas)
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 8. SYSTEM_SETTINGS (configurações globais)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir configurações padrão
INSERT INTO system_settings (key, value, description) VALUES
    ('maintenance_mode', 'false', 'Ativar modo de manutenção'),
    ('registration_enabled', 'true', 'Permitir novos registros'),
    ('ai_model_version', 'gemini-2.0', 'Versão do modelo de IA'),
    ('max_upload_size_mb', '10', 'Tamanho máximo de upload em MB'),
    ('default_credits', '50', 'Créditos padrão para novos usuários')
ON CONFLICT (key) DO NOTHING;
`;
export async function runFullMigration() {
    console.log('🔧 Executando migração completa do banco de dados...\n');
    const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
    let successCount = 0;
    let failCount = 0;
    for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed) {
            try {
                process.stdout.write(`   Executing: ${trimmed.substring(0, 50)}${trimmed.length > 50 ? '...' : ''} `);
                await executeQuery(trimmed + ';');
                console.log('✅');
                successCount++;
            }
            catch (err) {
                console.log('❌');
                // Se o erro for de índice já existente, apenas avisamos mas não travamos
                if (err.message.includes('already exists') || err.code === '23505') {
                    console.warn(`   ⚠️  Aviso: Objeto já existe (pulando): ${err.message}`);
                    successCount++;
                }
                else {
                    console.error(`   🛑 Erro fatal no statement:`, trimmed);
                    console.error(`   Erro:`, err.message);
                    failCount++;
                    // Para erros realmente fatais na criação de tabelas base, podemos decidir se paramos ou não.
                    // Se for uma tabela essencial, provavelmente devemos parar.
                    if (trimmed.toUpperCase().includes('CREATE TABLE')) {
                        throw err;
                    }
                }
            }
        }
    }
    console.log(`\n📊 Resumo da Migração: ${successCount} sucessos, ${failCount} falhas.`);
    if (failCount === 0) {
        console.log('✅ Migração completa concluída com sucesso!');
    }
    else {
        console.warn('⚠️  Migração concluída com alguns avisos/erros não fatais.');
    }
}
// Manter compatibilidade com migração anterior
export async function runMigrations() {
    return runFullMigration();
}
