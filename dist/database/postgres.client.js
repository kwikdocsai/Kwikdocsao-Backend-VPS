import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME,
    };
// Aplicar configurações globais
config.max = 100;
config.idleTimeoutMillis = 30000;
config.connectionTimeoutMillis = 10000;
config.ssl = process.env.DATABASE_URL?.includes('sslmode=disable') ? false : {
    rejectUnauthorized: false, // Permitir SSL auto-assinado comum em heroku/easypanel
};
export const pool = new Pool(config);
export async function executeQuery(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    }
    catch (err) {
        console.error('Query error DETAILS:', {
            text,
            params: params ? JSON.stringify(params) : 'none',
            errorMsg: err.message
        });
        throw err;
    }
}
export async function executeTransaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    }
}
