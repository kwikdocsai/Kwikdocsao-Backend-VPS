import { executeQuery, pool } from './database/postgres.client.js';
async function verifySchema() {
    try {
        console.log('Verifying schema...');
        const result = await executeQuery(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'agent_prompts' AND column_name = 'is_active';
        `);
        if (result.rows.length > 0) {
            console.log('✅ Column is_active exists in agent_prompts table.');
            console.log(result.rows[0]);
        }
        else {
            console.error('❌ Column is_active DOES NOT EXIST in agent_prompts table.');
        }
    }
    catch (err) {
        console.error('Error verifying schema:', err);
    }
    finally {
        await pool.end();
    }
}
verifySchema();
