import { executeQuery } from '../database/postgres.client.js';
export async function runAddN8nFieldsToSubscriptionsMigration() {
    console.log('🔧 Running Migration: Add N8N Fields to Server Subscriptions...');
    try {
        await executeQuery(`
            ALTER TABLE server_subscriptions
            ADD COLUMN IF NOT EXISTS n8n_url TEXT,
            ADD COLUMN IF NOT EXISTS workflow_id TEXT,
            ADD COLUMN IF NOT EXISTS webhook_url TEXT;
        `);
        console.log('   ✅ Added columns: n8n_url, workflow_id, webhook_url to server_subscriptions.');
    }
    catch (err) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
