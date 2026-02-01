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
async function testEndpoints() {
    try {
        console.log('=== TESTING REPORTS ENDPOINTS ===\n');
        // Get test user and company
        const userRes = await pool.query('SELECT id, company_id FROM users ORDER BY created_at DESC LIMIT 1');
        const user = userRes.rows[0];
        const companyRes = await pool.query('SELECT id, name FROM companies WHERE id = $1', [user.company_id]);
        const company = companyRes.rows[0];
        console.log(`Testing with User: ${user.id}`);
        console.log(`Company: ${company.name} (${company.id})\n`);
        // Test 1: Analytics endpoint
        console.log('--- Test 1: /api/reports/analytics ---');
        const analyticsRes = await pool.query(`SELECT * FROM view_fiscal_analytics 
             WHERE company_id = $1
             ORDER BY mes_referencia DESC
             LIMIT 12`, [user.company_id]);
        console.log(`Found ${analyticsRes.rowCount} analytics records`);
        if (analyticsRes.rowCount > 0) {
            console.table(analyticsRes.rows.slice(0, 3));
        }
        // Test 2: Distribution endpoint
        console.log('\n--- Test 2: /api/reports/distribution ---');
        const suppliersRes = await pool.query(`SELECT 
                COALESCE(data->'emitente'->>'nome', data->>'merchantName', 'Desconhecido') as name,
                SUM(COALESCE(valor_documento, 0)) as value
             FROM documents
             WHERE company_id = $1
               AND tipo_movimento = 'SAIDA'
               AND status IN ('COMPLETED', 'APROVADO')
             GROUP BY name
             ORDER BY value DESC
             LIMIT 5`, [user.company_id]);
        console.log(`Top suppliers: ${suppliersRes.rowCount}`);
        console.table(suppliersRes.rows);
        // Test 3: Faturix Stats
        console.log('\n--- Test 3: /api/faturix/stats ---');
        const statsRes = await pool.query(`SELECT 
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'ENTRADA' THEN COALESCE(valor_documento, 0) 
                    ELSE 0 
                END) as total_sales,
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'SAIDA' THEN COALESCE(valor_documento, 0) 
                    ELSE 0 
                END) as total_expenses,
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'ENTRADA' THEN COALESCE(valor_iva, 0) 
                    ELSE 0 
                END) as vat_payable,
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'SAIDA' THEN COALESCE(valor_iva, 0) 
                    ELSE 0 
                END) as vat_deductible
             FROM documents
             WHERE company_id = $1`, [user.company_id]);
        console.log('Fiscal Stats:');
        console.table(statsRes.rows);
        // Test 4: Check all companies
        console.log('\n--- Test 4: All Companies Data ---');
        const allCompaniesRes = await pool.query(`SELECT 
                c.name,
                COUNT(d.id) as doc_count,
                SUM(CASE WHEN d.tipo_movimento = 'ENTRADA' THEN 1 ELSE 0 END) as entradas,
                SUM(CASE WHEN d.tipo_movimento = 'SAIDA' THEN 1 ELSE 0 END) as saidas
             FROM companies c
             LEFT JOIN documents d ON d.company_id = c.id
             GROUP BY c.id, c.name
             ORDER BY doc_count DESC`);
        console.table(allCompaniesRes.rows);
    }
    catch (e) {
        console.error('Error:', e.message);
    }
    finally {
        await pool.end();
    }
}
testEndpoints();
