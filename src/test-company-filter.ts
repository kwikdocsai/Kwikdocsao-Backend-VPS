
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

async function testQueries() {
    try {
        console.log('=== TESTING COMPANY FILTER QUERIES ===\n');

        // Get a user and company
        const userRes = await pool.query('SELECT id, company_id FROM users LIMIT 1');
        const user = userRes.rows[0];
        console.log('Test User:', user);

        // Get company details
        const companyRes = await pool.query('SELECT id, name, nif FROM companies WHERE id = $1', [user.company_id]);
        const company = companyRes.rows[0];
        console.log('User Company:', company);

        // Test 1: Documents for this company
        console.log('\n--- Test 1: Documents by company_id ---');
        const docs1 = await pool.query(
            'SELECT id, file_name, company_id, tipo_movimento, valor_documento FROM documents WHERE company_id = $1',
            [user.company_id]
        );
        console.log(`Found ${docs1.rowCount} documents for company ${company.name}`);
        console.table(docs1.rows);

        // Test 2: Simulate the subquery approach
        console.log('\n--- Test 2: Documents using subquery (SELECT company_id FROM users) ---');
        const docs2 = await pool.query(
            'SELECT id, file_name, company_id, tipo_movimento, valor_documento FROM documents WHERE company_id = (SELECT company_id FROM users WHERE id = $1)',
            [user.id]
        );
        console.log(`Found ${docs2.rowCount} documents using subquery`);

        // Test 3: Check view_fiscal_analytics
        console.log('\n--- Test 3: Check view_fiscal_analytics ---');
        try {
            const analytics = await pool.query(
                'SELECT * FROM view_fiscal_analytics WHERE company_id = $1 ORDER BY mes_referencia DESC LIMIT 3',
                [user.company_id]
            );
            console.log(`Found ${analytics.rowCount} analytics records`);
            console.table(analytics.rows);
        } catch (e) {
            console.log('view_fiscal_analytics error:', e.message);
        }

        // Test 4: Test the actual getFaturixStats query
        console.log('\n--- Test 4: Simulate getFaturixStats financial query ---');
        const companyNif = company.nif || '';
        const financialRes = await pool.query(
            `SELECT 
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'ENTRADA' OR UPPER(movement_type) = 'ENTRADA' 
                    THEN COALESCE(valor_documento, 0) 
                    ELSE 0 
                END) as total_sales,
                
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'SAIDA' OR UPPER(movement_type) = 'SAIDA'
                    THEN COALESCE(valor_documento, 0) 
                    ELSE 0 
                END) as total_expenses,
    
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'ENTRADA' OR UPPER(movement_type) = 'ENTRADA'
                    THEN COALESCE(valor_iva, 0) 
                    ELSE 0 
                END) as vat_payable,
    
                SUM(CASE 
                    WHEN UPPER(tipo_movimento) = 'SAIDA' OR UPPER(movement_type) = 'SAIDA'
                    THEN COALESCE(valor_iva, 0) 
                    ELSE 0 
                END) as vat_deductible
             FROM documents
             WHERE company_id = $1`,
            [user.company_id]
        );

        console.log('Financial Stats:');
        console.table(financialRes.rows);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

testQueries();
