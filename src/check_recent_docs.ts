
import { executeQuery } from './database/postgres.client.js';

async function checkRecentDocs() {
    try {
        console.log('Checking recent documents...');
        const res = await executeQuery("SELECT id, file_name, status, created_at FROM documents ORDER BY created_at DESC LIMIT 5");
        console.log('Recent Documents:');
        res.rows.forEach(r => console.log(`- [${r.id}] ${r.file_name} | Status: ${r.status} | Created: ${r.created_at}`));

        process.exit(0);
    } catch (err) {
        console.error('Error checking documents:', err);
        process.exit(1);
    }
}

checkRecentDocs();
