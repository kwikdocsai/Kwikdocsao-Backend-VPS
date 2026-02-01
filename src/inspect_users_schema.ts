
import { pool } from './database/postgres.client.js';

async function inspectUsersSchema() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'");
        console.log('Columns in users table:');
        console.table(res.rows);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
        process.exit();
    }
}

inspectUsersSchema();
