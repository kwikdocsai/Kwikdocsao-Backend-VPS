import { executeQuery } from './database/postgres.client.js';
async function diag() {
    try {
        console.log('--- DOCUMENT COUNTS BY STATUS ---');
        const docs = await executeQuery('SELECT status, COUNT(*) FROM documents GROUP BY status');
        console.table(docs.rows);
        console.log('\n--- COMPANIES ---');
        const companies = await executeQuery('SELECT id, name FROM companies');
        console.table(companies.rows);
        console.log('\n--- FISCAL ANALYTICS VIEW CONTENT ---');
        const analytics = await executeQuery('SELECT * FROM view_fiscal_analytics LIMIT 10');
        console.table(analytics.rows);
        if (analytics.rows.length === 0) {
            console.log('\n[!] WARNING: view_fiscal_analytics is empty!');
            const sample = await executeQuery('SELECT id, company_id, status, created_at, data FROM documents LIMIT 1');
            console.log('Sample Document:', JSON.stringify(sample.rows[0], null, 2));
        }
    }
    catch (e) {
        console.error('Diag failed:', e);
    }
}
diag();
