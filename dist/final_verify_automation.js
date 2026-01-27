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
async function verifyAll() {
    try {
        console.log('🧪 Iniciando Verificação Final...');
        const idsRes = await pool.query("SELECT company_id, uploaded_by FROM documents WHERE company_id IS NOT NULL AND uploaded_by IS NOT NULL LIMIT 1");
        if (idsRes.rows.length === 0) {
            console.log('⚠️ Nenhum documento real encontrado para extrair IDs válidos.');
            return;
        }
        const { company_id, uploaded_by } = idsRes.rows[0];
        console.log(`✅ Usando IDs reais: Company=${company_id}, User=${uploaded_by}`);
        const testDocId = 'f' + Math.random().toString(16).slice(2, 33).slice(0, 31); // UUID fake mas único
        // Na verdade, UUID tem formato específico.
        const fakeUuid = '00000000-0000-0000-0000-' + Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
        console.log(`📦 Inserindo Documento de Teste: ${fakeUuid}`);
        await pool.query(`
            INSERT INTO documents (id, company_id, uploaded_by, status, file_name, data)
            VALUES ($1, $2, $3, 'ERROR', 'auto_test_alert.pdf', $4)
        `, [fakeUuid, company_id, uploaded_by, JSON.stringify({
                totalAmount: 5000,
                taxAmount: 100,
                baseAmount: 100, // Mismatch proposital
                invoiceNo: '', // Ausente propositalmente
                merchantName: 'AGT Automation Test'
            })]);
        console.log('🔍 Aguardando processamento do Trigger...');
        await new Promise(r => setTimeout(r, 1000));
        const alertsRes = await pool.query("SELECT * FROM ai_alerts WHERE document_id = $1", [fakeUuid]);
        console.log(`📊 Alertas gerados: ${alertsRes.rows.length}`);
        alertsRes.rows.forEach(alert => {
            console.log(`- [${alert.agent_name}] ${alert.severity}: ${alert.title}`);
        });
        if (alertsRes.rows.length >= 2) {
            console.log('🎉 SUCESSO! Sistema de Automação de Alertas Fiscais 100% Validado.');
        }
        else {
            console.log('⚠️ Nem todos os alertas foram gerados. Verifique a lógica do Trigger.');
        }
    }
    catch (err) {
        console.error('❌ Erro na validação final:', err);
    }
    finally {
        await pool.end();
    }
}
verifyAll();
