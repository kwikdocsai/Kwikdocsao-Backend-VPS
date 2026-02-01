import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});
async function inspect() {
    try {
        console.log('=== INSPECTING FATURIX_AUDITS DATA ===\n');
        // 1. Documents by Company in faturix_audits
        console.log('--- Audits by Company ---');
        const auditRes = await pool.query(`
            SELECT 
                a.company_id,
                c.name as company_name,
                COUNT(a.*) as audit_count
            FROM faturix_audits a
            LEFT JOIN companies c ON a.company_id = c.id
            GROUP BY a.company_id, c.name
        `);
        console.table(auditRes.rows);
        // 2. Check for NULL company_id
        const nullRes = await pool.query('SELECT COUNT(*) FROM faturix_audits WHERE company_id IS NULL');
        console.log(`Audits with NULL company_id: ${nullRes.rows[0].count}`);
        // 3. Check types of documents in audits
        const typeRes = await pool.query('SELECT doc_type, COUNT(*) FROM faturix_audits GROUP BY doc_type');
        console.log('\n--- Audits by Doc Type ---');
        console.table(typeRes.rows);
        // 4. Check status distribution
        const statusRes = await pool.query('SELECT status, COUNT(*) FROM faturix_audits GROUP BY status');
        console.log('\n--- Audits by Status ---');
        console.table(statusRes.rows);
        // 5. Test the query logic used in getFaturixStats
        console.log('\n--- Testing query logic for a specific company ---');
        const targetCompany = auditRes.rows.find(r => r.company_id !== null);
        if (targetCompany) {
            const testStats = await pool.query(`SELECT 
                    COUNT(*) as total_docs,
                    COUNT(*) FILTER (WHERE status = 'aprovado' OR status = 'COMPLETED') as approved_docs,
                    COUNT(*) FILTER (WHERE status = 'aprovado_manual' OR status = 'APROVADO_USUARIO') as approved_manual_docs,
                    COUNT(*) FILTER (WHERE status = 'rejeitado' OR status = 'REJEITADO') as rejected_docs
                 FROM faturix_audits 
                 WHERE company_id = $1`, [targetCompany.company_id]);
            console.log(`Stats for ${targetCompany.company_name}:`);
            console.table(testStats.rows);
        }
    }
    catch (e) {
        console.error('Error:', e.message);
    }
    finally {
        await pool.end();
    }
}
inspect();
