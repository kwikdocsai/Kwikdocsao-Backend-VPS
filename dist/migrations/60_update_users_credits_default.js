import { executeQuery } from '../database/postgres.client.js';
export async function runUpdateUsersCreditsDefaultMigration() {
    console.log('🔧 Updating users table default credits to 15...');
    // 1. Update the column default for future inserts
    await executeQuery('ALTER TABLE users ALTER COLUMN credits SET DEFAULT 15;');
    // We already have a seed in system_settings for initial_signup_credits = 15.
    console.log('✅ Default credits updated to 15 in users table.');
}
