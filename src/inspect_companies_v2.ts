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

async function inspectCompanies() {
    const client = await pool.connect();
    try {
        console.log("Checking companies table...");
        const res = await client.query('SELECT * FROM companies LIMIT 1');
        if (res.rows.length > 0) {
            console.log("Columns:", Object.keys(res.rows[0]));
            console.log("Sample Data:", res.rows[0]);
        } else {
            console.log("No companies found.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

inspectCompanies();
