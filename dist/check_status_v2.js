import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432')
});
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
        await pool.end();
    }
}
checkStatus();
