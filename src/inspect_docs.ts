import { executeQuery, pool } from '../database/postgres.client';

async function inspect() {
    try {
        console.log("Checking documents table...");
        const res = await executeQuery('SELECT * FROM documents LIMIT 1');
        if (res.rows.length > 0) {
            console.log("Columns:", Object.keys(res.rows[0]));
            console.log("Sample Data:", JSON.stringify(res.rows[0].data, null, 2));
        } else {
            console.log("No documents found.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

inspect();
