import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { runFixCompanyStatusConstraintMigration } from './migrations/34_fix_company_status_constraint.js';

(async () => {
    try {
        await runFixCompanyStatusConstraintMigration();
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
