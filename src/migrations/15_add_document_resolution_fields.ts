
import { executeQuery } from '../database/postgres.client.js';

export async function runAddDocumentResolutionFieldsMigration() {
    console.log('🔧 Executando migração: Adição de campos de resolução em documentos...');

    try {
        await executeQuery(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(50) DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
            ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);
        `);

        console.log('✅ Campos de resolução adicionados com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração de campos de resolução:', err);
        throw err;
    }
}
