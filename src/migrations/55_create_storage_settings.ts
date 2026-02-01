import { pool } from '../database/postgres.client.js';

export async function up() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS storage_settings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                provider VARCHAR(50) NOT NULL DEFAULT 'contabo',
                endpoint VARCHAR(255) NOT NULL,
                region VARCHAR(50) NOT NULL,
                bucket VARCHAR(100) NOT NULL,
                access_key VARCHAR(255) NOT NULL,
                secret_key VARCHAR(255) NOT NULL,
                tenant_id VARCHAR(255),
                is_active BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Check if we already have a focused config
        const existing = await client.query('SELECT COUNT(*) as count FROM storage_settings WHERE is_active = true');
        if (parseInt(existing.rows[0].count) === 0) {
            // Insert default from env if available, else placeholders
            // Note: In a real app we might read process.env here but since this is a migration file 
            // strictly for schema, we'll leave it empty or insert a seed if needed.
            // Let's rely on the Admin UI to populate it or a seed script.
        }

        await client.query('COMMIT');
        console.log('Migration down: storage_settings table created');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
        throw e;
    } finally {
        client.release();
    }
}
