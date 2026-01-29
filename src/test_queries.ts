
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

async function run() {
    console.log('Testing connection...');
    try {
        const testRes = await pool.query('SELECT NOW()');
        console.log('Connection OK:', testRes.rows[0]);
    } catch (e) {
        console.error('Connection FAILED:', e.message);
        process.exit(1);
    }

    const userId = '7aed6b16-ed5b-47f5-98cc-294572f44d3e';

    console.log('\n--- Query 1: Basic Documents Search ---');
    try {
        const res = await pool.query('SELECT count(*) FROM documents');
        console.log('Documents count:', res.rows[0].count);
    } catch (e) {
        console.error('Query 1 FAILED:', e.message);
    }

    console.log('\n--- Query 2: Financials from Documents ---');
    try {
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimento = 'ENTRADA' THEN valor_documento ELSE 0 END), 0) as total_sales,
                COALESCE(SUM(CASE WHEN tipo_movimento = 'SAIDA' THEN valor_documento ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(CASE WHEN tipo_movimento = 'ENTRADA' THEN valor_iva ELSE 0 END), 0) as vat_payable,
                COALESCE(SUM(CASE WHEN tipo_movimento = 'SAIDA' THEN valor_iva ELSE 0 END), 0) as vat_deductible,
                COALESCE(SUM(valor_retencao), 0) as total_retention,
                COALESCE(COUNT(*) FILTER (WHERE status_fiscal = 'ALERTA' OR fiscal_status = 'ALERTA' OR compliance_level = 'ALTO'), 0) as total_alerts
             FROM documents
        `;
        const res = await pool.query(query);
        console.log('Financials OK:', res.rows[0]);
    } catch (e) {
        console.error('Query 2 FAILED:', e.message);
    }

    console.log('\n--- Query 3: Check faturix_audits ---');
    try {
        const res = await pool.query('SELECT count(*) FROM faturix_audits');
        console.log('faturix_audits count:', res.rows[0].count);
    } catch (e) {
        console.error('Query 3 FAILED:', e.message);
    }

    console.log('\n--- Query 4: Check audit_logs ---');
    try {
        const res = await pool.query('SELECT count(*) FROM audit_logs');
        console.log('audit_logs count:', res.rows[0].count);
    } catch (e) {
        console.error('Query 4 FAILED:', e.message);
    }

    await pool.end();
}

run();
