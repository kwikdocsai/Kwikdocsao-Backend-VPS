import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
const { Pool } = pg;
const pool = new Pool({
    user: 'conversioao',
    password: 'Mercedes@g63',
    host: '173.249.39.97',
    port: 5433,
    database: 'kwikdocsai',
    ssl: false
});
async function inspectKeys() {
    try {
        const res = await pool.query(`SELECT data FROM documents WHERE data IS NOT NULL LIMIT 1`);
        if (res.rows.length > 0) {
            console.log('Document Data Keys:', Object.keys(res.rows[0].data));
            console.log('Sample Data:', JSON.stringify(res.rows[0].data, null, 2));
        }
        else {
            console.log('No documents found with data.');
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await pool.end();
    }
}
inspectKeys();
