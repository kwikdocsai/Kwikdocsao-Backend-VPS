import { executeQuery } from '../database/postgres.client.js';
export async function runSurgicalFixFaturixStats() {
    console.log('🔧 [SurgicalFix] Healing Faturix Stats and Core Tables...');
    try {
        // 1. Add missing fiscal_status to documents
        console.log('   Updating documents table...');
        await executeQuery(`
            ALTER TABLE public.documents 
            ADD COLUMN IF NOT EXISTS fiscal_status TEXT,
            ADD COLUMN IF NOT EXISTS valor_base NUMERIC DEFAULT 0;
        `);
        // Sync fiscal_status with status_fiscal if needed
        await executeQuery(`
            UPDATE public.documents 
            SET fiscal_status = COALESCE(fiscal_status, status_fiscal)
            WHERE fiscal_status IS NULL AND status_fiscal IS NOT NULL;
        `);
        // 2. Restore faturix_audits if missing
        console.log('   Restoring faturix_audits table if missing...');
        await executeQuery(`
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
        // 3. Restore audit_logs if missing
        console.log('   Restoring audit_logs table if missing...');
        await executeQuery(`
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
        console.log('✅ [SurgicalFix] Database healed successfully!');
    }
    catch (err) {
        console.error('❌ [SurgicalFix] Failed:', err.message);
        throw err;
    }
}
