
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: 'postgres://conversioao:Mercedes%40g63@173.249.39.97:5433/kwikdocsai?sslmode=disable'
});

async function debug() {
    try {
        console.log('--- DB DIAGNOSTIC ---');

        // 1. Check schemas
        const schemaRes = await pool.query("SELECT current_schema();");
        console.log('Current Schema:', schemaRes.rows[0].current_schema);

        // 2. Check counts by status
        const statusRes = await pool.query("SELECT status, count(*) FROM documents GROUP BY status;");
        console.log('Document Status Counts:', statusRes.rows);

        // 3. Check documents with resolution_notes or responsible_user_id
        const resDocs = await pool.query(`
      SELECT id, status, responsible_user_id, resolution_notes 
      FROM documents 
      WHERE responsible_user_id IS NOT NULL OR resolution_notes IS NOT NULL
      LIMIT 10;
    `);
        console.log('Resolved Documents:', resDocs.rows);

        // 4. Check if we can join with users
        if (resDocs.rows.length > 0) {
            for (const doc of resDocs.rows) {
                if (doc.responsible_user_id) {
                    const userRes = await pool.query('SELECT id, name FROM users WHERE id = $1', [doc.responsible_user_id]);
                    console.log(`User Join for doc ${doc.id}:`, userRes.rows);
                }
            }
        }

        await pool.end();
    } catch (err) {
        console.error('ERROR:', err);
        process.exit(1);
    }
}

debug();
