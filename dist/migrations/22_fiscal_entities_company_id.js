import { executeQuery } from '../database/postgres.client.js';
export async function runFiscalEntitiesCompanyIdMigration() {
    console.log('Running Migration: 22_fiscal_entities_company_id');
    try {
        await executeQuery(`
            ALTER TABLE fiscal_entities 
            ADD COLUMN IF NOT EXISTS company_id UUID,
            ADD CONSTRAINT fk_fiscal_entities_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

            -- Update existing records if possible (linking to user's company)
            UPDATE fiscal_entities fe
            SET company_id = u.company_id
            FROM users u
            WHERE fe.user_id = u.id AND fe.company_id IS NULL;

            CREATE INDEX IF NOT EXISTS idx_fiscal_entities_company ON fiscal_entities(company_id);
        `);
        console.log('Migration 22_fiscal_entities_company_id completed.');
    }
    catch (err) {
        console.error('Migration 22 failed:', err);
    }
}
