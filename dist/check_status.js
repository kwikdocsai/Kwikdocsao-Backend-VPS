import { pool } from './database/postgres.client.js';
async function checkStatus() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT status, COUNT(*) FROM documents GROUP BY status');
        console.log("Document Status Counts:", res.rows);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        client.release();
        pool.end();
    }
}
// Auto-run
checkStatus().then(() => process.exit(0));
