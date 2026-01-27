
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

async function runAudit() {
    try {
        console.log('🚀 Iniciando Auditoria Fiscal Sentinel (DB-Level)...');

        const sqlPath = path.join(__dirname, 'sentinel_audit.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        const result = await pool.query(sql);

        const alertCount = result.rows.length;

        console.log('------------------------------------------');
        if (alertCount > 0) {
            console.log(`✅ Auditoria concluída com sucesso!`);
            console.log(`🚨 NOVOS ERROS ENCONTRADOS: ${alertCount}`);
            console.log('Os alertas foram inseridos e já estão visíveis no Dashboard.');
        } else {
            console.log('✅ Auditoria concluída. Nenhum novo erro fiscal detectado.');
        }
        console.log('------------------------------------------');

    } catch (err) {
        console.error('❌ Erro durante a auditoria:', err);
    } finally {
        await pool.end();
    }
}

runAudit();
