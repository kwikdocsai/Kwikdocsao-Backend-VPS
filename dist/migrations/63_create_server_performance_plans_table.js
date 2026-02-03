import { executeQuery } from '../database/postgres.client.js';
export async function runServerPerformancePlansMigration() {
    console.log('🔧 Running Migration: Create Server Performance Plans Table...');
    try {
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS server_performance_plans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                monthly_credits INTEGER NOT NULL DEFAULT 0,
                n8n_base_url TEXT NOT NULL,
                n8n_api_key TEXT NOT NULL,
                n8n_template_id TEXT NOT NULL,
                is_visible BOOLEAN DEFAULT true,
                color VARCHAR(50) DEFAULT 'text-cyan-400',
                features JSONB DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_server_performance_plans_slug ON server_performance_plans(slug);
        `);
        // Seed initial data based on current requirements
        const seedSql = `
            INSERT INTO server_performance_plans 
            (slug, name, description, monthly_credits, n8n_base_url, n8n_api_key, n8n_template_id, color, features)
            VALUES 
            ('BASIC', 'Server BASIC', 'Servidor de alta performance BASIC', 0, 'https://n8n.conversio.ao/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMWJhODliNC1iNzNjLTQzYTctYmNkYi1iYmQ0NWFlYWQ5YzEiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5MjcyNzE3fQ.7RLHJpWRT4uXu8yabptFzHmowo7OuPsmBcE_zMG6eyg', '7KaKgqfnJ2IgvBGY', 'text-cyan-400', '["Vitesse 5x", "Suporte Prioritário"]'),
            ('STANDARD', 'Server STANDARD', 'Servidor de alta performance STANDARD', 120, 'https://n8n.conversio.ao/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMWJhODliNC1iNzNjLTQzYTctYmNkYi1iYmQ0NWFlYWQ5YzEiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5MjcyNzE3fQ.7RLHJpWRT4uXu8yabptFzHmowo7OuPsmBcE_zMG6eyg', '7KaKgqfnJ2IgvBGY', 'text-blue-400', '["Vitesse 10x", "Fila Dedicada"]'),
            ('PRO', 'Server PRO', 'Servidor de alta performance PRO', 250, 'https://n8n.conversio.ao/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMWJhODliNC1iNzNjLTQzYTctYmNkYi1iYmQ0NWFlYWQ5YzEiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5MjcyNzE3fQ.7RLHJpWRT4uXu8yabptFzHmowo7OuPsmBcE_zMG6eyg', '7KaKgqfnJ2IgvBGY', 'text-purple-400', '["Vitesse Max", "Instância Isolada"]'),
            ('DEDICATED', 'Server DEDICATED', 'Servidor de alta performance DEDICATED', 500, 'https://n8n.conversio.ao/', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMWJhODliNC1iNzNjLTQzYTctYmNkYi1iYmQ0NWFlYWQ5YzEiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY5MjcyNzE3fQ.7RLHJpWRT4uXu8yabptFzHmowo7OuPsmBcE_zMG6eyg', '7KaKgqfnJ2IgvBGY', 'text-amber-400', '["SLA 99.9%", "Personalização Total"]')
            ON CONFLICT (slug) DO UPDATE SET
                n8n_base_url = EXCLUDED.n8n_base_url,
                n8n_api_key = EXCLUDED.n8n_api_key,
                n8n_template_id = EXCLUDED.n8n_template_id,
                monthly_credits = EXCLUDED.monthly_credits;
        `;
        await executeQuery(seedSql);
        console.log('   ✅ server_performance_plans table created and seeded.');
    }
    catch (err) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
