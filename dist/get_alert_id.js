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
async function getAlert() {
    try {
        const res = await pool.query("SELECT id FROM ai_alerts WHERE is_resolved = false LIMIT 1");
        if (res.rows.length > 0) {
            console.log('ALERT_ID:', res.rows[0].id);
        }
        else {
            console.log('Nenhum alerta pendente encontrado.');
        }
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await pool.end();
    }
}
getAlert();
