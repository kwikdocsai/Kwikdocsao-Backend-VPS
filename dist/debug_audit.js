import { executeQuery } from './database/postgres.client.js';
async function debug() {
    try {
        console.log('--- Document Resolution Audit Logs ---');
        const auditRes = await executeQuery(`
            SELECT 
                created_at, 
                user_id, 
                action, 
                target_id, 
                details 
            FROM audit_logs 
            WHERE action = 'resolve_document_error'
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        auditRes.rows.forEach(row => {
            console.log(`[${row.created_at}] User: ${row.user_id} Action: ${row.action} Doc: ${row.target_id}`);
            console.log('Details:', JSON.stringify(row.details, null, 2));
            console.log('-------------------');
        });
        console.log('\n--- Checking Document Status Names ---');
        const statusRes = await executeQuery('SELECT DISTINCT status FROM documents');
        console.table(statusRes.rows);
    }
    catch (err) {
        console.error('Debug script failed:', err);
    }
    finally {
        process.exit();
    }
}
debug();
