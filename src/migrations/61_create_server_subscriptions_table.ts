
import { executeQuery } from '../database/postgres.client.js';

export async function runServerSubscriptionsMigration() {
    console.log('🔧 Running Server Subscriptions Migration...');
    try {
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS server_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                server_type VARCHAR(50) NOT NULL,
                monthly_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
                started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_server_subscriptions_company_id ON server_subscriptions(company_id);
        `);
        console.log('   ✅ server_subscriptions table check/creation completed');
    } catch (err: any) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
