import { executeQuery } from '../database/postgres.client.js';
export async function runAddActiveStatusToAgentsMigration() {
    console.log('--- RUNNING AGENT STATUS MIGRATION (54) ---');
    try {
        await executeQuery(`
            ALTER TABLE agent_prompts 
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        `);
        console.log('Added is_active column to agent_prompts.');
    }
    catch (error) {
        console.error('Error adding is_active column:', error);
    }
    console.log('Migration 54 finished.');
}
