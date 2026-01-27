const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
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
            SELECT id, company_id, status, created_at, original_filename 
            FROM documents 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log('\n--- Recent Documents ---');
        docsRes.rows.forEach(d => {
            console.log(`ID: ${d.id.substring(0, 8)}... | Company: ${d.company_id} | Status: ${d.status} | Date: ${d.created_at} | File: ${d.original_filename}`);
        });
        // 3. Check Metrics Logic (Simulation)
        // Checking for docs in last 30 days
        const metricsRes = await pool.query(`
            SELECT COUNT(*) 
            FROM documents 
            WHERE created_at >= NOW() - INTERVAL '30 days'
        `);
        console.log(`\nDocs in last 30 days: ${metricsRes.rows[0].count}`);
    }
    catch (err) {
        console.error('Error:', err);
    }
    finally {
        await pool.end();
    }
}
inspectData();
export {};
