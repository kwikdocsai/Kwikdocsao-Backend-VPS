import { pool } from '../database/postgres.client.js';
export async function up() {
    console.log('🚀 [Migration] Ensuring complete audit_logs schema...');
    await pool.query(`
        -- 1. Create table if not exists (defensive)
        CREATE TABLE IF NOT EXISTS public.audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID,
            action TEXT NOT NULL,
            details JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- 2. Add all missing columns required by modern logSystemAction
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS company_id UUID;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_id VARCHAR(100);
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(100);
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

        -- 3. Add performance indexes
        CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs (company_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
        
        -- 4. Clean up legacy columns if they exist (safe rename or keep)
        -- Migration 12 mentioned 'resource_id', keeping it for data safety but logic uses target_id
    `);
    console.log('✅ [Migration] audit_logs schema verified and updated.');
}
export async function down() {
    // We don't drop columns in down to prevent data loss
}
