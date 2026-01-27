
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

async function verifyDistribution() {
    try {
        console.log('🧪 Testando agregação de Distribuição Fiscal...');

        // 1. Get a test company
        const companyRes = await pool.query('SELECT id FROM companies LIMIT 1');
        if (companyRes.rowCount === 0) {
            console.log('⚠️ Nenhuma empresa encontrada.');
            return;
        }
        const companyId = companyRes.rows[0].id;

        // 2. Call the new function
        const startDate = '2020-01-01'; // wide range for testing
        const endDate = '2026-12-31';

        const res = await pool.query(
            'SELECT fn_get_fiscal_distribution($1, $2, $3) as distribution',
            [companyId, startDate, endDate]
        );

        console.log('📊 Resultado da Agregação:');
        console.log(JSON.stringify(res.rows[0].distribution, null, 2));

        if (res.rows[0].distribution.top_suppliers.length > 0 || res.rows[0].distribution.spending_categories.length > 0) {
            console.log('✅ Verificação concluída com sucesso! Dados reais agregados.');
        } else {
            console.log('ℹ️ Verificação concluída. Função retornou arrays vazios (sem documentos no período).');
        }

    } catch (err) {
        console.error('❌ Erro no teste de agregação:', err);
    } finally {
        await pool.end();
    }
}

verifyDistribution();
