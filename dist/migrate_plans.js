import { executeQuery } from './database/postgres.client.js';
async function migrateSchema() {
    try {
        console.log('Updating server_performance_plans schema...');
        // Add new columns to server_performance_plans
        await executeQuery(`
            ALTER TABLE server_performance_plans 
            ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS analysis_cost NUMERIC(10,2) DEFAULT 1,
            ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false
        `);
        console.log('Columns added to server_performance_plans.');
        // Drop the obsolete plans table
        console.log('Dropping obsolete plans table...');
        await executeQuery('DROP TABLE IF EXISTS plans CASCADE');
        console.log('Plans table dropped.');
        process.exit(0);
    }
    catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}
migrateSchema();
