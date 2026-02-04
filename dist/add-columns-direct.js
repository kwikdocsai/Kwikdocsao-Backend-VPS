import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});
async function run() {
    try {
        console.log('Adicionando colunas...');
        await pool.query(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS tipo_movimento TEXT,
            ADD COLUMN IF NOT EXISTS movement_type TEXT,
            ADD COLUMN IF NOT EXISTS nif_emitente TEXT,
            ADD COLUMN IF NOT EXISTS valor_documento NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS valor_iva NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS status_fiscal TEXT,
            ADD COLUMN IF NOT EXISTS fiscal_status TEXT,
            ADD COLUMN IF NOT EXISTS compliance_level TEXT;
        `);
        console.log('Sucesso!');
    }
    catch (e) {
        console.error('Erro:', e);
    }
    finally {
        await pool.end();
        process.exit(0);
    }
}
run();
