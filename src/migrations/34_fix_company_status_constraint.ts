import { executeQuery } from '../database/postgres.client.js';

const UPDATE_CONSTRAINT_SQL = `
-- Drop existing constraint
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

-- Re-add constraint with new values
ALTER TABLE companies ADD CONSTRAINT companies_status_check 
CHECK (status IN ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED', 'VALIDATE'));
`;

export async function runFixCompanyStatusConstraintMigration() {
    console.log('🔧 Updating companies status constraint...');
    try {
        await executeQuery(UPDATE_CONSTRAINT_SQL);
        console.log('✅ Company status constraint updated successfully!');
    } catch (err) {
        console.error('❌ Error updating constraint:', err);
        throw err;
    }
}
