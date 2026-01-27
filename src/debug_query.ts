
import { executeQuery } from './database/postgres.client.js';

async function debug() {
    try {
        console.log('--- ALL STATUSES ---');
        const statusRes = await executeQuery('SELECT status, count(*) FROM documents GROUP BY status');
        console.table(statusRes.rows);

        console.log('\n--- SAMPLE RECENT DOCUMENTS ---');
        const sampleRes = await executeQuery('SELECT id, status, resolution_notes, responsible_user_id FROM documents ORDER BY created_at DESC LIMIT 20');
        console.table(sampleRes.rows);

    } catch (err) {
        console.error('Debug script failed:', err);
    } finally {
        process.exit();
    }
}

debug();
