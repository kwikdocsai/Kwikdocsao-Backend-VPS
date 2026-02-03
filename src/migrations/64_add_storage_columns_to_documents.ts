
import { executeQuery } from '../database/postgres.client.js';

export async function runStorageMigration() {
    console.log('🔧 Running Migration: Refactoring Document Storage to Cloud S3...');
    try {
        // 1. Add new columns for storage metadata
        await executeQuery(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS storage_path TEXT,
            ADD COLUMN IF NOT EXISTS bucket_name TEXT;
        `);

        // 2. Ensure file_url is not null if we move away from base64
        // For now, we keep it nullable to support internal state but eventual goal is to make it required.

        console.log('   ✅ Added storage columns to documents table.');

        // Note: We don't drop file_base64 yet to avoid data loss on existing files.
        // We'll do a separate cleanup migration after verification.

    } catch (err: any) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
