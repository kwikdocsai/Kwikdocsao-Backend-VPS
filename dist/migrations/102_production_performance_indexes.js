import { pool } from '../database/postgres.client.js';
export async function up() {
    console.log('🚀 [Migration] Adding performance indexes...');
    await pool.query(`
        -- Performance Indexes for Documents
        CREATE INDEX IF NOT EXISTS idx_documents_company_created ON documents (company_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
        
        -- Performance Indexes for Audit Logs
        CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs (company_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
        
        -- Performance Indexes for AI Alerts
        CREATE INDEX IF NOT EXISTS idx_ai_alerts_company_created ON ai_alerts (company_id, created_at DESC);
        
        -- User indexes for fast lookup
        CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);
        CREATE INDEX IF NOT EXISTS idx_users_owner_id ON users (owner_id);
    `);
    console.log('✅ [Migration] Performance indexes added successfully');
}
export async function down() {
    await pool.query(`
        DROP INDEX IF EXISTS idx_documents_company_created;
        DROP INDEX IF EXISTS idx_documents_status;
        DROP INDEX IF EXISTS idx_audit_logs_company_created;
        DROP INDEX IF EXISTS idx_audit_logs_user_id;
        DROP INDEX IF EXISTS idx_ai_alerts_company_created;
        DROP INDEX IF EXISTS idx_users_company_id;
        DROP INDEX IF EXISTS idx_users_owner_id;
    `);
}
