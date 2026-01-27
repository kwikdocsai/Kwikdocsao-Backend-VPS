import { runAddMissingFiscalColsMigration } from './migrations/29_add_missing_fiscal_cols.js';
import { pool } from './database/postgres.client.js';
async function run() {
    try {
        await runAddMissingFiscalColsMigration();
        console.log('Migração concluída!');
    }
    catch (e) {
        console.error(e);
    }
    finally {
        await pool.end();
        process.exit(0);
    }
}
run();
