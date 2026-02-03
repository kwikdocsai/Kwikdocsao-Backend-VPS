
import { executeQuery } from './database/postgres.client.js';

async function listTables() {
    try {
        console.log('Listing tables...');
        const res = await executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:');
        res.rows.forEach(r => console.log(`- ${r.table_name}`));

        process.exit(0);
    } catch (err) {
        console.error('Error listing tables:', err);
        process.exit(1);
    }
}

listTables();
