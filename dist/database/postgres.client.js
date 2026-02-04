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
// [SRE] Hardening Connection Pool for Production Stability
// Prevent "Silent Drop" issues with TCP Keep-Alive and timeouts.
config.max = 50; // Reduced from 100 to prevent saturation overlap
config.idleTimeoutMillis = 10000; // 10s idle (release faster)
config.connectionTimeoutMillis = 5000; // 5s to fail if DB is unreachable
config.keepAlive = true; // Enable TCP Keep-Alive
// @ts-ignore - pg types might miss this specific option but it exists in driver
config.keepAliveInitialDelayMillis = 10000;
export const pool = new Pool(config);
// [SRE] Observability: Log Pool Events
pool.on('error', (err, client) => {
    console.error('❌ [DB-POOL] Unexpected error on idle client', err);
    // Don't process.exit(1), let the pool reconnect.
});
pool.on('connect', (client) => {
    // Enable statement timeout for every new connection to prevent infinite hangs
    // 30s limit for any query.
    client.query('SET statement_timeout = 30000')
        .catch(err => console.error('⚠️ [DB-POOL] Failed to set statement_timeout', err));
});
export async function executeQuery(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // Log deep queries or slow ones
        if (duration > 1000) {
            console.warn(`⚠️ [SLOW QUERY] ${duration}ms: ${text.substring(0, 100)}...`);
        }
        return res;
    }
    catch (err) {
        // Enhance error log
        console.error('❌ [DB-QUERY] Error:', {
            text: text.substring(0, 200),
            error: err.message,
            duration: Date.now() - start
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
