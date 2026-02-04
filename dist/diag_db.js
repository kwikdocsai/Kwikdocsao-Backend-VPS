import { executeQuery } from './database/postgres.client.js';
import { authService } from './auth/auth.service.js';
async function diagnose() {
    const userId = '7aed6b16-ed5b-47f5-98cc-294572f44d3e'; // Using the companyId from user request as a proxy or just any valid ID
    console.log('--- Database Diagnostic Start ---');
    // Check if documents table has the expected columns
    try {
        console.log('\nChecking "documents" table columns...');
        const res = await executeQuery(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'documents'
        `);
        console.log('Columns found:', res.rows.map(r => r.column_name).join(', '));
        const requiredCols = ['tipo_movimento', 'valor_documento', 'valor_iva', 'valor_retencao', 'status_fiscal', 'fiscal_status', 'compliance_level'];
        const missingCols = requiredCols.filter(c => !res.rows.find(r => r.column_name === c));
        if (missingCols.length > 0) {
            console.log('❌ MISSING COLUMNS in documents:', missingCols.join(', '));
        }
        else {
            console.log('✅ All required columns exist in "documents".');
        }
    }
    catch (e) {
        console.error('❌ Error checking documents columns:', e.message);
    }
    // Check if faturix_audits table exists
    try {
        console.log('\nChecking if "faturix_audits" table exists...');
        const res = await executeQuery("SELECT 1 FROM information_schema.tables WHERE table_name = 'faturix_audits'");
        if (res.rowCount === 0) {
            console.log('❌ Table "faturix_audits" is MISSING.');
        }
        else {
            console.log('✅ Table "faturix_audits" exists.');
        }
    }
    catch (e) {
        console.error('❌ Error checking faturix_audits:', e.message);
    }
    // Check if audit_logs table exists
    try {
        console.log('\nChecking if "audit_logs" table exists...');
        const res = await executeQuery("SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs'");
        if (res.rowCount === 0) {
            console.log('❌ Table "audit_logs" is MISSING.');
        }
        else {
            console.log('✅ Table "audit_logs" exists.');
        }
    }
    catch (e) {
        console.error('❌ Error checking audit_logs:', e.message);
    }
    // Try a direct stat query
    try {
        console.log('\nTesting getFaturixStats logic...');
        const companyId = '7aed6b16-ed5b-47f5-98cc-294572f44d3e';
        const stats = await authService.getFaturixStats(userId, companyId);
        console.log('✅ getFaturixStats executed successfully.');
    }
    catch (e) {
        console.error('❌ getFaturixStats FAILED:', e.message);
        if (e.stack)
            console.error(e.stack);
    }
    process.exit(0);
}
diagnose();
