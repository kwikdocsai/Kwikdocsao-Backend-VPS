
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

async function inspectData() {
    try {
        console.log('--- INSPECTING DASHBOARD DATA ---');

        // 1. Check Total Documents
        const countRes = await pool.query('SELECT COUNT(*) FROM documents');
        console.log(`Total Documents in DB: ${countRes.rows[0].count}`);

        // 2. List Recent Documents with Key Fields
        const docsRes = await pool.query(`
            SELECT id, company_id, status, created_at, file_name 
            FROM documents 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log('\n--- Recent Documents ---');
        docsRes.rows.forEach(d => {
            console.log(`ID: ${d.id.substring(0, 8)}... | Company: ${d.company_id} | Status: ${d.status} | Date: ${d.created_at} | File: ${d.file_name}`);
        });

        // 3. User & Company
        const userRes = await pool.query('SELECT id, name FROM users LIMIT 1');
        const compRes = await pool.query('SELECT id, name FROM companies LIMIT 1');
        console.log('\n--- First User & Company ---');
        if (userRes.rows[0]) console.log(`User: ${userRes.rows[0].name} (${userRes.rows[0].id})`);
        if (compRes.rows[0]) console.log(`Company: ${compRes.rows[0].name} (${compRes.rows[0].id})`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

inspectData();
