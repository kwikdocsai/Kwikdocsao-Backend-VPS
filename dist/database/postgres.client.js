import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : {
        rejectUnauthorized: true, // ENFORCED FOR PRODUCTION
        ca: process.env.DB_CA_CERT // Expected in production env
    },
    max: 100, // Increased for production stability (PgBouncer recommended)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
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
