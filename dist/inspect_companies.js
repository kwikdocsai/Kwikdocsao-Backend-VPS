import { pool } from './database/postgres.client.js';
async function inspectCompanies() {
    const client = await pool.connect();
    try {
        console.log("Checking companies table...");
        const res = await client.query('SELECT * FROM companies LIMIT 1');
        if (res.rows.length > 0) {
            console.log("Columns:", Object.keys(res.rows[0]));
            // Log sample data to guess values for 'regime'
            console.log("Sample Data:", res.rows[0]);
        }
        else {
            console.log("No companies found.");
        }
    }
    catch (e) {
        console.error(e);
    }
    finally {
        client.release();
        await pool.end();
    }
}
inspectCompanies().then(() => process.exit(0));
