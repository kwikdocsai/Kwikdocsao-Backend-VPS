
import { executeQuery } from '../database/postgres.client.js';

export async function runRestoreMissingDocumentFieldsMigration() {
    console.log('🔧 Executando migração: Restauração de campos em falta na tabela documents...');

    try {
        await executeQuery(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS raw_n8n_response JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS full_analysis JSONB DEFAULT '{}';
        `);

        console.log('✅ Campos raw_n8n_response e full_analysis restaurados!');
    } catch (err) {
        console.error('❌ Erro na migração de restauração de campos:', err);
        throw err;
    }
}
