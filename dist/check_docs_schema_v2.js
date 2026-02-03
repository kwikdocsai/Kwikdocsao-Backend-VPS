import { executeQuery } from './database/postgres.client.js';
async function checkDocumentsSchema() {
    try {
        console.log('Checking documents table columns with schema...');
        const res = await executeQuery("SELECT table_schema, column_name, data_type FROM information_schema.columns WHERE table_name = 'documents'");
        console.log('Columns in documents:');
        res.rows.forEach(r => console.log(`- [${r.table_schema}] ${r.column_name}: ${r.data_type}`));
        process.exit(0);
    }
    catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}
checkDocumentsSchema();
