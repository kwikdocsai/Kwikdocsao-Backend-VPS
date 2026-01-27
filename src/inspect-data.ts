
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
        console.log('=== INSPECTING FISCAL DATA ===\n');

        // 1. Count total documents
        const countRes = await pool.query('SELECT COUNT(*) FROM documents');
        console.log(`Total documents: ${countRes.rows[0].count}\n`);

        // 2. Check fiscal columns
        console.log('--- Sample Document Data ---');
        const sampleRes = await pool.query(`
            SELECT 
                id, file_name, status, tipo_movimento, 
                valor_documento, valor_iva, nif_emitente, status_fiscal,
                company_id, created_at
            FROM documents 
            ORDER BY created_at DESC 
            LIMIT 5
        `);

        console.table(sampleRes.rows);

        // 3. Check aggregations by movement type
        console.log('\n--- Aggregations by Movement Type ---');
        const aggRes = await pool.query(`
            SELECT 
                tipo_movimento,
                COUNT(*) as count,
                SUM(valor_documento) as total_value,
                SUM(valor_iva) as total_vat
            FROM documents
            WHERE tipo_movimento IS NOT NULL
            GROUP BY tipo_movimento
        `);
        console.table(aggRes.rows);

        // 4. Check company association
        console.log('\n--- Documents by Company ---');
        const companyRes = await pool.query(`
            SELECT 
                d.company_id,
                c.name as company_name,
                COUNT(d.*) as doc_count
            FROM documents d
            LEFT JOIN companies c ON d.company_id = c.id
            GROUP BY d.company_id, c.name
        `);
        console.table(companyRes.rows);

        // 5. Check faturix_audits table
        console.log('\n--- Faturix Audits ---');
        try {
            const auditRes = await pool.query('SELECT COUNT(*) FROM faturix_audits');
            console.log(`Total faturix_audits: ${auditRes.rows[0].count}`);
        } catch (e) {
            console.log('faturix_audits table does not exist or error:', e.message);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

inspect();
