import { executeQuery } from '../database/postgres.client.js';
export const runSystemSettingsTableMigration = async () => {
    try {
        console.log('🔄 Executing migration: CREATE/UPDATE system_settings table and SEED data...');
        // 1. Create/Update Table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                type VARCHAR(20) NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json', 'secret')),
                group_name VARCHAR(50) NOT NULL DEFAULT 'business',
                is_secret BOOLEAN DEFAULT FALSE,
                description TEXT,
                updated_at TIMESTAMP DEFAULT NOW(),
                updated_by UUID
            );
        `);
        // Ensure all columns exist for older versions of the table
        await executeQuery(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'string';`);
        await executeQuery(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS group_name VARCHAR(50) NOT NULL DEFAULT 'business';`);
        await executeQuery(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;`);
        await executeQuery(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS description TEXT;`);
        await executeQuery(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_by UUID;`);
        // 2. Re-categorize 'general' group to 'business' or appropriate ones to match frontend tabs
        await executeQuery(`UPDATE system_settings SET group_name = 'business' WHERE group_name = 'general';`);
        // 3. Seed Initial Data
        const settings = [
            // --- AI & AGENTS ---
            { key: 'openai_api_key', value: '', type: 'secret', group: 'ai', is_secret: true, description: 'Chave de API da OpenAI para os agentes.' },
            { key: 'sentinel_nif_length', value: '10', type: 'number', group: 'ai', is_secret: false, description: 'Número de dígitos esperado para validação de NIF.' },
            { key: 'sentinel_tax_tolerance', value: '1.0', type: 'number', group: 'ai', is_secret: false, description: 'Tolerância (em Kz) para divergências de cálculo fiscal.' },
            // --- INTEGRATIONS ---
            { key: 'n8n_webhook_url', value: 'https://kaizen-n8n.wlv4pu.easypanel.host/webhook-test/Kwikdocs', type: 'string', group: 'integrations', is_secret: false, description: 'Webhook do n8n para análise de documentos.' },
            // --- BUSINESS RULES ---
            { key: 'plan_credits_free', value: '10', type: 'number', group: 'business', is_secret: false, description: 'Créditos mensais do plano Free.' },
            { key: 'plan_credits_pro', value: '100', type: 'number', group: 'business', is_secret: false, description: 'Créditos mensais do plano Pro.' },
            { key: 'plan_credits_enterprise', value: '500', type: 'number', group: 'business', is_secret: false, description: 'Créditos mensais do plano Enterprise.' },
            { key: 'initial_signup_credits', value: '50', type: 'number', group: 'business', is_secret: false, description: 'Bônus de créditos ao registrar nova conta.' },
            // --- SECURITY & INFRA ---
            { key: 'jwt_expires_in', value: '24h', type: 'string', group: 'security', is_secret: false, description: 'Tempo de expiração do token de sessão.' },
            { key: 'db_host', value: process.env.DB_HOST || '', type: 'string', group: 'infra', is_secret: false, description: 'Host do Banco de Dados Principal.' },
            { key: 'db_port', value: process.env.DB_PORT || '5432', type: 'number', group: 'infra', is_secret: false, description: 'Porta do Banco de Dados.' },
            { key: 'db_name', value: process.env.DB_NAME || '', type: 'string', group: 'infra', is_secret: false, description: 'Nome do Banco de Dados.' },
            { key: 'db_user', value: process.env.DB_USER || '', type: 'string', group: 'infra', is_secret: false, description: 'Usuário do Banco de Dados.' },
            { key: 'db_password', value: process.env.DB_PASSWORD || '', type: 'secret', group: 'infra', is_secret: true, description: 'Senha do Banco de Dados.' },
            // --- API & VERSION ---
            { key: 'api_version', value: '1.0.0', type: 'string', group: 'integrations', is_secret: false, description: 'Versão atual da API do Backoffice.' },
            { key: 'api_base_url', value: 'http://localhost:5000', type: 'string', group: 'integrations', is_secret: false, description: 'URL Base da API para ambientes de produção/HTTPS.' },
            { key: 'nif_webhook_url', value: '', type: 'string', group: 'integrations', is_secret: false, description: 'Webhook URL para verificação de validade de NIF na AGT.' }
        ];
        for (const s of settings) {
            // Upsert: Only update metadata (type, group, description) if exists, OR insert if missing.
            // Value is NOT updated to preserve current config if already set.
            // Exception: If current value is empty and we have a value from ENV, we seed it.
            await executeQuery(`
                INSERT INTO system_settings (key, value, type, group_name, is_secret, description)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (key) DO UPDATE SET
                    type = EXCLUDED.type,
                    group_name = EXCLUDED.group_name,
                    is_secret = EXCLUDED.is_secret,
                    description = EXCLUDED.description,
                    value = CASE 
                        WHEN system_settings.value IS NULL OR system_settings.value = '' THEN EXCLUDED.value 
                        ELSE system_settings.value 
                    END;
            `, [s.key, s.value, s.type, s.group, s.is_secret, s.description]);
        }
        console.log('✅ Migration system_settings completed.');
    }
    catch (err) {
        console.error('❌ Migration system_settings failed:', err);
    }
};
