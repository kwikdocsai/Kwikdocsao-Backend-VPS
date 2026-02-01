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
async function runAuditEnrichmentMigration() {
    try {
        console.log('🏗️ Enriquecendo tabela audit_logs com company_id...');
        const sqlPath = path.join(__dirname, 'migrations', '14_add_company_id_to_audit_logs.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('✅ Tabela audit_logs atualizada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de enriquecimento de logs:', err);
    }
    finally {
        await pool.end();
    }
}
runAuditEnrichmentMigration();
