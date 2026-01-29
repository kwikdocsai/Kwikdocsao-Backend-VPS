import { executeQuery } from './database/postgres.client.js';
async function check() {
    try {
        console.log('--- SERVER PLANS TABLE CHECK ---');
        const res = await executeQuery("SELECT * FROM server_performance_plans LIMIT 1");
        console.log('Successfully fetched rows:', res.rowCount);
        if (res.rowCount > 0) {
            console.log('Columns found:', Object.keys(res.rows[0]));
        }
        process.exit(0);
    }
    catch (err) {
        console.error('SQL ERROR:', err.message);
        process.exit(1);
    }
}
check();
