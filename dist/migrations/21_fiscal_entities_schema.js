import { executeQuery } from '../database/postgres.client.js';
export async function runFiscalEntitiesMigration() {
    console.log('Running Migration: 21_fiscal_entities_schema');
    try {
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS fiscal_entities (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                nif VARCHAR(50) NOT NULL,
                name VARCHAR(255),
                tax_regime VARCHAR(100) DEFAULT 'N/A',
                status VARCHAR(50) DEFAULT 'ACTIVE',
                address TEXT,
                country VARCHAR(50) DEFAULT 'Angola',
                last_seen_at TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, nif)
            );

            CREATE INDEX IF NOT EXISTS idx_fiscal_entities_user_nif ON fiscal_entities(user_id, nif);
        `);
        console.log('Migration 21_fiscal_entities_schema completed.');
    }
    catch (err) {
        console.error('Migration 21 failed:', err);
    }
}
