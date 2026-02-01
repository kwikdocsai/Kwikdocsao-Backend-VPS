import { executeQuery } from '../database/postgres.client.js';

export const runSystemLogsTableMigration = async () => {
    try {
        console.log('Running migration: Create system_logs table...');
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS public.system_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                action VARCHAR(255) NOT NULL,
                resource VARCHAR(255) NOT NULL,
                resource_id VARCHAR(255),
                details JSONB DEFAULT '{}',
                ip_address VARCHAR(45),
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                company_id UUID REFERENCES users(id)
            );
        `);
        console.log('Migration completed: system_logs table created.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
};
