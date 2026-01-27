import { executeQuery } from '../database/postgres.client.js';
export const runCreateBankAccountsMigration = async () => {
    try {
        console.log('Running Migration 58: Create Bank Accounts Table...');
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS bank_accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                bank_name VARCHAR(100) NOT NULL,
                account_number VARCHAR(100) NOT NULL,
                iban VARCHAR(100) NOT NULL,
                swift VARCHAR(50),
                holder_name VARCHAR(150) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        // Seed initial example if empty
        const count = await executeQuery('SELECT COUNT(*) as c FROM bank_accounts');
        if (parseInt(count.rows[0].c) === 0) {
            await executeQuery(`
                INSERT INTO bank_accounts (bank_name, account_number, iban, swift, holder_name)
                VALUES ('Banco BAI', '123456789.10.001', 'AO06.0040.0000.1234.5678.9012.3', 'BAIAOAQA', 'KwikDocs Lda')
            `);
        }
        console.log('Migration 58 completed.');
    }
    catch (err) {
        console.error('Migration 58 failed:', err.message);
    }
};
