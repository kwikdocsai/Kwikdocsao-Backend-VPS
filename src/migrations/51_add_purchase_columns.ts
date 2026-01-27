
import { executeQuery } from '../database/postgres.client.js';

export async function runPurchaseColumnsMigration() {
    console.log('🔧 Running Purchase Data Migration...');

    try {
        // 1. Add columns to transactions if they don't exist
        await executeQuery(`
            ALTER TABLE transactions
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
            ADD COLUMN IF NOT EXISTS proof_document TEXT, -- Base64 encoded file
            ADD COLUMN IF NOT EXISTS admin_notes TEXT,
            ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
        `);

        console.log('   ✅ Added columns: payment_method, proof_document, admin_notes, user_id.');

    } catch (error: any) {
        console.error('   ❌ Migration Failed:', error.message);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runPurchaseColumnsMigration();
}
