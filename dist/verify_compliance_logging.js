import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
const { Pool } = pg;
const pool = new Pool({
    user: 'conversioao',
    password: 'Mercedes@g63',
    host: '173.249.39.97',
    port: 5433,
    database: 'kwikdocsai',
    ssl: false
});
async function verifyComplianceLogging() {
    try {
        console.log('🧪 Iniciando Verificação de Histórico de Conformidade...');
        // 1. Get a test company
        const companyRes = await pool.query('SELECT id FROM companies LIMIT 1');
        if (companyRes.rowCount === 0) {
            console.log('⚠️ Nenhuma empresa encontrada para teste.');
            return;
        }
        const companyId = companyRes.rows[0].id;
        console.log(`🏢 Usando Empresa ID: ${companyId}`);
        // 2. Insert mock compliance log
        console.log('📝 Inserindo log de teste (FISCAL_VALIDATION_BATCH)...');
        const details = {
            message: "Processamento de 10 documentos concluído. 2 inconsistências detectadas.",
            doc_count: 10,
            error_count: 2,
            batch_ids: ["test-batch-1", "test-batch-2"],
            sync_status: "SUCCESS"
        };
        await pool.query(`INSERT INTO audit_logs (action, resource_type, target_id, details, company_id) 
             VALUES ($1, $2, $3, $4, $5)`, ['FISCAL_VALIDATION_BATCH', 'compliance', companyId, JSON.stringify(details), companyId]);
        // 3. Query logs for the company
        console.log('🔍 Consultando Feed de Conformidade (Últimos 10)...');
        const logsRes = await pool.query(`SELECT action, details->>'message' as msg, created_at 
             FROM audit_logs 
             WHERE company_id = $1 AND action = 'FISCAL_VALIDATION_BATCH'
             ORDER BY created_at DESC LIMIT 10`, [companyId]);
        console.log(`📊 Logs encontrados: ${logsRes.rowCount}`);
        logsRes.rows.forEach(log => {
            console.log(`- [${log.created_at}] ${log.msg}`);
        });
        console.log('✅ Verificação concluída com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na verificação:', err);
    }
    finally {
        await pool.end();
    }
}
verifyComplianceLogging();
