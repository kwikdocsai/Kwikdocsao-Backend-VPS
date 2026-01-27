import { executeQuery } from './database/postgres.client.js';
async function checkRecentAudits() {
    try {
        console.log('Checking recent faturix audits...');
        const res = await executeQuery("SELECT id, file_name, status, created_at, processed_at FROM faturix_audits ORDER BY created_at DESC LIMIT 5");
        console.log('Recent Audits:');
        res.rows.forEach(r => console.log(`- [${r.id}] ${r.file_name} | Status: ${r.status} | Created: ${r.created_at} | Processed: ${r.processed_at}`));
        process.exit(0);
    }
    catch (err) {
        console.error('Error checking audits:', err);
        process.exit(1);
    }
}
checkRecentAudits();
