import { executeQuery } from './database/postgres.client.js';
async function countDocs() {
    try {
        const res = await executeQuery("SELECT count(*) FROM documents");
        console.log('Document Count:', res.rows[0].count);
        const resAudits = await executeQuery("SELECT count(*) FROM faturix_audits");
        console.log('Audit Count:', resAudits.rows[0].count);
        process.exit(0);
    }
    catch (err) {
        console.error('Error counting:', err);
        process.exit(1);
    }
}
countDocs();
