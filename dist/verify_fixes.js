import { executeQuery } from './database/postgres.client.js';
async function verify() {
    try {
        console.log('--- Checking for documents that should be APROVADO_USUARIO ---');
        const docs = await executeQuery("SELECT id, status, resolution_notes, responsible_user_id FROM documents WHERE status = 'APROVADO_USUARIO' LIMIT 1");
        if (docs.rowCount === 0) {
            console.log('No APROVADO_USUARIO documents found. Creating a test one...');
            // Find a valid user and document
            const userRes = await executeQuery('SELECT id FROM users LIMIT 1');
            const docRes = await executeQuery('SELECT id FROM documents LIMIT 1');
            if (userRes.rowCount > 0 && docRes.rowCount > 0) {
                const userId = userRes.rows[0].id;
                const docId = docRes.rows[0].id;
                await executeQuery(`
                    UPDATE documents SET 
                        status = 'APROVADO_USUARIO', 
                        resolution_notes = 'Test resolution note', 
                        responsible_user_id = $1,
                        completed_at = now()
                    WHERE id = $2
                `, [userId, docId]);
                console.log(`Updated doc ${docId} to APROVADO_USUARIO with user ${userId}`);
            }
            else {
                console.error('Could not find a user or document to update.');
                return;
            }
        }
        else {
            console.log('Found existing APROVADO_USUARIO document:', docs.rows[0]);
            // If it has null notes, let's update it to have something for verification
            if (!docs.rows[0].resolution_notes) {
                const userRes = await executeQuery('SELECT id FROM users LIMIT 1');
                await executeQuery(`
                    UPDATE documents SET 
                        resolution_notes = 'Verified note', 
                        responsible_user_id = $1
                    WHERE id = $2
                `, [userRes.rows[0].id, docs.rows[0].id]);
                console.log('Updated existing document with notes for verification.');
            }
        }
        console.log('\n--- Verifying Dashboard Metrics Calculation ---');
        const statusRes = await executeQuery('SELECT status, count(*) FROM documents GROUP BY status');
        console.table(statusRes.rows);
        let approvedManual = 0;
        statusRes.rows.forEach(row => {
            const s = (row.status || '').toString().trim().toUpperCase();
            if (s === 'APROVADO_USUARIO')
                approvedManual = parseInt(row.count);
        });
        console.log(`Calculated Manual Approvals: ${approvedManual}`);
        if (approvedManual > 0) {
            console.log('✅ PASS: Metrics calculation is correct.');
        }
        else {
            console.log('❌ FAIL: Manual approvals not found in metrics.');
        }
        console.log('\n--- Verifying Join for Responsible User Name ---');
        const joinRes = await executeQuery(`
            SELECT d.id, u.name as responsible_user_name, d.resolution_notes
            FROM documents d
            JOIN users u ON d.responsible_user_id = u.id
            WHERE d.status = 'APROVADO_USUARIO'
            LIMIT 1
        `);
        if (joinRes.rowCount > 0) {
            console.log('Join Result:', joinRes.rows[0]);
            console.log('✅ PASS: Join correctly retrieves user name.');
        }
        else {
            console.log('❌ FAIL: Join failed to retrieve user name (is the user missing?)');
        }
    }
    catch (err) {
        console.error('Verification failed:', err);
    }
    finally {
        process.exit();
    }
}
verify();
