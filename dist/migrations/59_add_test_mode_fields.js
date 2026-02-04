import { executeQuery } from '../database/postgres.client.js';
export const runTestModeSchemaMigration = async () => {
    try {
        console.log('[MIGRATION] Checking for Test Mode columns in users table...');
        // Add test_mode_active
        await executeQuery(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='test_mode_active') THEN
                    ALTER TABLE users ADD COLUMN test_mode_active BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);
        // Add test_mode_expires_at
        await executeQuery(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='test_mode_expires_at') THEN
                    ALTER TABLE users ADD COLUMN test_mode_expires_at TIMESTAMP WITH TIME ZONE;
                END IF;
            END $$;
        `);
        // Add test_mode_usage_count
        await executeQuery(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='test_mode_usage_count') THEN
                    ALTER TABLE users ADD COLUMN test_mode_usage_count INTEGER DEFAULT 0;
                END IF;
            END $$;
        `);
        console.log('[MIGRATION] Test Mode columns added successfully.');
    }
    catch (err) {
        console.error('[MIGRATION_ERROR] Failed to add Test Mode columns:', err);
    }
};
