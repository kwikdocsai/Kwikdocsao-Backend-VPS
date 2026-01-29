
import { executeQuery } from '../database/postgres.client.js';

export const runAddFiscalColumnsToCompaniesMigration = async () => {
    try {
        console.log('Running migration: Add fiscal columns to companies table...');

        await executeQuery(`
            ALTER TABLE companies
            ADD COLUMN IF NOT EXISTS fiscal_status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS is_defaulter BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS fiscal_residence BOOLEAN DEFAULT TRUE;
        `);

        console.log('Migration completed: Fiscal columns added successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
};
