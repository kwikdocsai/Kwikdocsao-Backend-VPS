import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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
async function runDistributionMigration() {
    try {
        console.log('🏗️ Criando função SQL para Distribuição Fiscal (Gráficos)...');
        const sqlPath = path.join(__dirname, 'migrations', 'setup_fiscal_distribution_function.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('✅ Função fn_get_fiscal_distribution criada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração da função de distribuição:', err);
    }
    finally {
        await pool.end();
    }
}
runDistributionMigration();
