import { executeQuery } from './database/postgres.client.js';
async function checkFaturixSchema() {
    try {
        console.log('Checking faturix_audits table columns...');
        const res = await executeQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'faturix_audits'");
        console.log('Columns in faturix_audits:');
        res.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));
        process.exit(0);
    }
    catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}
checkFaturixSchema();
