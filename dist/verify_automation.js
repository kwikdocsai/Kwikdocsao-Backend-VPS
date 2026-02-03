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
async function verifyAutomation() {
    try {
        console.log('🧪 Testando Automação de Alertas...');
        // 1. Simular inserção de documento com erro de IVA
        const mockDoc = {
            id: 'e1234567-89ab-cdef-0123-456789abcdef', // UUID Fictício
            company_id: '8093dbec-bef8-4033-87f5-2ca8b438317e',
            user_id: '7192f16b-ae16-43e6-8968-0fb536417f7b',
            status: 'ERROR',
            file_name: 'test_auto_iva.pdf',
            data: {
                totalAmount: 1000,
                taxAmount: 50, // Mismatch proposital (1000 != 50 + 100)
                baseAmount: 100,
                merchantName: 'Test Automation Inc'
            }
        };
        console.log('📦 Inserindo documento de teste (IVA mismatch)...');
        await pool.query(`
            INSERT INTO documents (id, company_id, uploaded_by, status, file_name, data)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET status = 'ERROR', data = EXCLUDED.data
        `, [mockDoc.id, mockDoc.company_id, mockDoc.user_id, mockDoc.status, mockDoc.file_name, mockDoc.data]);
        // 2. Verificar se o alerta foi criado pelo trigger
        console.log('🔍 Verificando se o Alerta Sentinel foi gerado...');
        const alertRes = await pool.query("SELECT * FROM ai_alerts WHERE document_id = $1", [mockDoc.id]);
        if (alertRes.rows.length > 0) {
            console.log('✅ SUCESSO! Alerta gerado automaticamente pelo Trigger:');
            console.log(JSON.stringify(alertRes.rows[0], null, 2));
        }
        else {
            console.log('❌ FALHA: O trigger não gerou o alerta.');
        }
    }
    catch (err) {
        console.error('❌ Erro no teste:', err);
    }
    finally {
        await pool.end();
    }
}
verifyAutomation();
