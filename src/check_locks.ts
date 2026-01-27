import { executeQuery } from './database/postgres.client.js';

async function check() {
    console.log('🔍 Checking active queries and locks...');
    try {
        const res = await executeQuery(`
            SELECT 
                pid, 
                usename, 
                application_name, 
                client_addr, 
                state, 
                wait_event_type, 
                wait_event, 
                pg_blocking_pids(pid) as blocked_by,
                query
            FROM pg_stat_activity 
            WHERE state = 'active' OR state = 'idle in transaction'
            ORDER BY state DESC;
        `);

        if (res.rows.length === 0) {
            console.log('✅ No active or idle-in-transaction queries found.');
        } else {
            console.log('⚠️  Found active/blocked queries:');
            console.table(res.rows);
        }
    } catch (err) {
        console.error('❌ Error checking locks:', err);
    }
    process.exit(0);
}

check();
