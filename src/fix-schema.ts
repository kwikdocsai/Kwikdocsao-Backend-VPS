
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
        console.log('--- DB INFO ---');
        console.log('Host:', process.env.DB_HOST);
        console.log('DB:', process.env.DB_NAME);

        console.log('Checking columns in documents table...');
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'documents'
        `);

        console.log('Columns found:', res.rows.map(r => r.column_name).join(', '));

        const requiredColumns = [
            'tipo_movimento', 'movement_type', 'nif_emitente',
            'valor_documento', 'valor_iva', 'status_fiscal',
            'fiscal_status', 'compliance_level'
        ];

        for (const col of requiredColumns) {
            if (!res.rows.find(r => r.column_name === col)) {
                console.log(`Adding missing column: ${col}`);
                const type = col.includes('valor') ? 'NUMERIC DEFAULT 0' : 'TEXT';
                await pool.query(`ALTER TABLE documents ADD COLUMN ${col} ${type}`);
            }
        }

        console.log('Schema update complete.');
    } catch (e) {
        console.error('An error occurred:', e);
    } finally {
        await pool.end();
    }
}

run().catch(console.error);
