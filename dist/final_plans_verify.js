import { pool } from './database/postgres.client.js';
async function finalVerify() {
    try {
        const data = await pool.query("SELECT name, price_credits FROM plans ORDER BY price_credits ASC");
        console.table(data.rows);
    }
    catch (e) {
        console.error('Error:', e);
    }
    finally {
        await pool.end();
        process.exit();
    }
}
finalVerify();
