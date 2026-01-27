import { executeQuery } from '../database/postgres.client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runCreateFiscalAnalyticsViewMigration = async () => {
    try {
        console.log('Running migration: Create Fiscal Analytics View...');

        // Read the SQL file
        const sqlPath = path.join(__dirname, 'setup_fiscal_analytics_view.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute
        await executeQuery(sql);

        console.log('Migration completed: view_fiscal_analytics created/updated.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
};
