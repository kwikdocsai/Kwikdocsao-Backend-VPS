
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

async function runGroupingMigration() {
    try {
        console.log('🏗️ Configurando Visão Agrupada de Erros Fiscais...');
        const sqlPath = path.join(__dirname, 'migrations', 'setup_grouped_errors_view.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('✅ Visão view_grouped_fiscal_errors criada com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração de agrupamento:', err);
    } finally {
        await pool.end();
    }
}

runGroupingMigration();
