
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

async function setupViews() {
    try {
        console.log('=== SETTING UP FISCAL VIEWS ===\n');

        // Read and execute the fiscal analytics view SQL
        const analyticsViewPath = path.join(__dirname, 'migrations', 'setup_fiscal_analytics_view.sql');
        const analyticsSQL = fs.readFileSync(analyticsViewPath, 'utf-8');

        console.log('Creating view_fiscal_analytics...');
        await pool.query(analyticsSQL);
        console.log('✅ view_fiscal_analytics created');

        // Test the view
        const testRes = await pool.query('SELECT * FROM view_fiscal_analytics LIMIT 5');
        console.log(`\nView has ${testRes.rowCount} rows`);
        if (testRes.rowCount > 0) {
            console.table(testRes.rows);
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

setupViews();
