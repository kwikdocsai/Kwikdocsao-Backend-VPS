import { executeQuery, pool } from './src/database/postgres.client.js';

async function checkDocs() {
    console.log('--- CHECKING RECENT DOCUMENTS ---');
    try {
        const res = await executeQuery('SELECT id, file_name, status, created_at FROM documents ORDER BY created_at DESC LIMIT 10');
        console.table(res.rows);
    } catch (err) {
        console.error('Error querying documents:', err);
    } finally {
        await pool.end();
    }
}

checkDocs();
