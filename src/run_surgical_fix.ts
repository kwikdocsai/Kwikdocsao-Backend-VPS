
import { runSurgicalFixFaturixStats } from './migrations/101_surgical_fix_faturix_stats.js';
import { pool } from './database/postgres.client.js';

async function run() {
    try {
        await runSurgicalFixFaturixStats();
        console.log('Migration finished successfully.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}
run();
