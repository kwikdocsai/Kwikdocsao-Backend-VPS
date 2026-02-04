import { pool } from '../database/postgres.client.js';

export async function up() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Restore Faturix Audits
        await client.query(`
            CREATE TABLE IF NOT EXISTS faturix_audits (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id),
                company_id UUID REFERENCES companies(id),
                file_name TEXT,
                doc_type TEXT,
                status TEXT DEFAULT 'processando',
                summary TEXT,
                insights JSONB DEFAULT '[]',
                causes JSONB DEFAULT '[]',
                recommendations JSONB DEFAULT '[]',
                fiscal_data JSONB DEFAULT '{}',
                visual_quality JSONB DEFAULT '{}',
                fraud_analysis JSONB DEFAULT '{}',
                raw_response JSONB,
                full_analysis JSONB,
                decision_source TEXT DEFAULT 'agent',
                processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Restore Audit Logs (simplified)
        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id),
                company_id UUID REFERENCES companies(id),
                action TEXT,
                resource_type TEXT,
                target_id TEXT,
                details JSONB,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query('COMMIT');
        console.log('Restored faturix_audits and audit_logs tables.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
        throw e;
    } finally {
        client.release();
    }
}
