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
async function inspect() {
    try {
        console.log("Connecting...");
        const client = await pool.connect();
        console.log("Checking documents table...");
        const res = await client.query('SELECT * FROM documents LIMIT 1');
        if (res.rows.length > 0) {
            console.log("Columns:", Object.keys(res.rows[0]));
            console.log("Sample Data:", JSON.stringify(res.rows[0].data, null, 2));
        }
        else {
            console.log("No documents found.");
        }
        client.release();
    }
    catch (e) {
        console.error(e);
    }
    finally {
        await pool.end();
    }
}
inspect();
