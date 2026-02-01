
import { pool } from './database/postgres.client';

async function checkUsers() {
    try {
        const res = await pool.query('SELECT id, name, email, role FROM users');
        console.log('USERS_LIST_START');
        console.log(JSON.stringify(res.rows, null, 2));
        console.log('USERS_LIST_END');
    } catch (err) {
        console.error('Check users error:', err);
    } finally {
        await pool.end();
    }
}

checkUsers();
