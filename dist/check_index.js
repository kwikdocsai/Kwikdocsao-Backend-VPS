import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
    connectionString: 'postgres://conversioao:Mercedes%40g63@173.249.39.97:5433/kwikdocsai?sslmode=disable'
});
async function checkIndex() {
    try {
        console.log('--- INDEX DIAGNOSTIC ---');
        const res = await pool.query(`
            SELECT 
                tablename, 
                indexname, 
                indexdef 
            FROM 
                pg_indexes 
            WHERE 
                indexname = 'idx_documents_user'
        `);
        console.log('Index Info:', JSON.stringify(res.rows, null, 2));
        const relRes = await pool.query(`
            SELECT 
                relname, 
                relkind, 
                relnamespace::regnamespace as namespace 
            FROM 
                pg_class 
            WHERE 
                relname = 'idx_documents_user'
        `);
        console.log('pg_class Info:', JSON.stringify(relRes.rows, null, 2));
        await pool.end();
    }
    catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
}
checkIndex();
