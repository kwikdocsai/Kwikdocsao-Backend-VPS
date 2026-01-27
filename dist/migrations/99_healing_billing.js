import { executeQuery } from '../database/postgres.client.js';
export async function runHealingBillingMigration() {
    console.log('🔧 Running Healing Billing Migration...');
    try {
        // Transactions table fixes
        await executeQuery(`
            ALTER TABLE transactions 
            ADD COLUMN IF NOT EXISTS admin_notes TEXT,
            ADD COLUMN IF NOT EXISTS notes TEXT,
            ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
            ADD COLUMN IF NOT EXISTS proof_document TEXT,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
        console.log('   ✅ Transactions columns verified (including updated_at).');
        // User sessions table (for heartbeat)
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
                user_agent TEXT,
                ip_address TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('   ✅ user_sessions table verified.');
        // Users table fixes
        await executeQuery(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
        console.log('   ✅ Users activity and audit columns verified.');
        // Companies table fixes
        await executeQuery(`
            ALTER TABLE companies 
            ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
        console.log('   ✅ Companies billing and audit columns verified.');
    }
    catch (error) {
        console.error('   ❌ Healing Migration Failed:', error.message);
    }
}
