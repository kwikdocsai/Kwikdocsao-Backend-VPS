
import { executeQuery, pool } from './database/postgres.client.js';

async function run() {
    try {
        const res = await executeQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'documents'");
        console.log('Columns:', res.rows.map(r => r.column_name).join(', '));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
