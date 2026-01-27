import { executeQuery } from '../database/postgres.client.js';
export async function runSecurityUpdatesMigration() {
    console.log('🛡️ Running Security Updates Migration...');
    try {
        // Add must_change_password column if it doesn't exist
        await executeQuery(`
            ALTER TABLE public.users 
            ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
        `);
        console.log('✅ Security updates applied successfully!');
    }
    catch (error) {
        console.error('❌ Error applying security updates:', error);
        throw error;
    }
}
