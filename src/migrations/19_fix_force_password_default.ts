
import { executeQuery } from '../database/postgres.client.js';

export const runFixForcePasswordDefaultMigration = async () => {
    try {
        console.log('Running migration: Fix Force Password Default for Existing Users...');

        // Update all existing users to NOT force password change (audit fix)
        // This ensures that only NEWLY created members (via the specific endpoint) will have the flag set to true (by the code logic).
        await executeQuery(`
            UPDATE users 
            SET force_password_change = false 
            WHERE force_password_change = true
        `);

        console.log('Migration completed: Existing users password flag reset.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
};
