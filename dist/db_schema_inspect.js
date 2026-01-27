import { executeQuery } from './database/postgres.client.js';
async function diagnose() {
    try {
        console.log("--- USERS TABLE SCHEMA ---");
        const schema = await executeQuery(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users'
            ORDER BY ordinal_position
        `);
        schema.rows.forEach(col => {
            console.log(`- ${col.column_name} | ${col.data_type} | Nullable: ${col.is_nullable}`);
        });
        console.log("\n--- SAMPLES ---");
        const samples = await executeQuery('SELECT name, is_active FROM users LIMIT 5');
        samples.rows.forEach(s => {
            console.log(`- ${s.name} | is_active: ${s.is_active} (${typeof s.is_active})`);
        });
    }
    catch (err) {
        console.error("Diagnosis failed:", err);
    }
}
diagnose();
