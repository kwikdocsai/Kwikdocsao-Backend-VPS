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
async function runWatchdog() {
    try {
        console.log('🛡️ Iniciando Auditoria de Compliance WATCHDOG (SAFT-AO)...');
        const sqlPath = path.join(__dirname, 'watchdog_audit.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        const result = await pool.query(sql);
        const alertCount = result.rows.length;
        console.log('------------------------------------------');
        if (alertCount > 0) {
            console.log(`✅ Auditoria WATCHDOG concluída!`);
            console.log(`⚠️ NOVAS PENDÊNCIAS ENCONTRADAS: ${alertCount}`);
            console.log('Alertas de compliance gerados e disponíveis no Dashboard.');
        }
        else {
            console.log('✅ Tudo em ordem! Nenhuma pendência de compliance SAFT detectada.');
        }
        console.log('------------------------------------------');
    }
    catch (err) {
        console.error('❌ Erro durante a auditoria Watchdog:', err);
    }
    finally {
        await pool.end();
    }
}
runWatchdog();
