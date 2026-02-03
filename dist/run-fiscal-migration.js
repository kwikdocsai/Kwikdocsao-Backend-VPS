import { runAddFiscalColumnsToCompaniesMigration } from './migrations/31_add_fiscal_columns_to_companies.js';
(async () => {
    await runAddFiscalColumnsToCompaniesMigration();
})();
