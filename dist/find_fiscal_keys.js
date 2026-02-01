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
async function findFiscalKeys() {
    try {
        console.log('Searching for fiscal keys across multiple documents...');
        const res = await pool.query(`
            SELECT data 
            FROM documents 
            WHERE data IS NOT NULL 
            LIMIT 10
        `);
        const allKeys = new Set();
        res.rows.forEach(row => {
            Object.keys(row.data).forEach(k => allKeys.add(k));
            if (row.data.issuer_data) {
                Object.keys(row.data.issuer_data).forEach(k => allKeys.add('issuer_data.' + k));
            }
        });
        console.log('Detected Keys:', Array.from(allKeys).join(', '));
        // Print a doc that actually has tax if possible
        const taxDoc = res.rows.find(r => r.data.taxAmount || r.data.taxableBase || r.data.iva_total);
        if (taxDoc) {
            console.log('Sample Fiscal Doc:', JSON.stringify(taxDoc.data, null, 2));
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await pool.end();
    }
}
findFiscalKeys();
