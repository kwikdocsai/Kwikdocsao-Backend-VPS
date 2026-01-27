import { executeQuery } from '../database/postgres.client.js';
export async function runNormalizeDocumentsMigration() {
    console.log('🔧 Executando migração: Normalização da tabela documents...');
    try {
        // Garantir que a tabela existe (caso runFullMigration não tenha rodado)
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS public.documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                file_name TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
        `);
        // Adicionar colunas em falta
        await executeQuery(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS company_id UUID,
            ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS file_url TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PROCESSING',
            ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'UNKNOWN',
            ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS raw_text TEXT,
            ADD COLUMN IF NOT EXISTS file_base64 TEXT,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
        `);
        // Tentar linkar company_id se a tabela companies existir
        try {
            await executeQuery('ALTER TABLE documents ADD CONSTRAINT fk_documents_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;');
        }
        catch (e) {
            console.log('ℹ️ Constraint de companhia não adicionada (pode já existir ou tabela companies ausente).');
        }
        console.log('✅ Tabela documents normalizada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro na migração de normalização:', err);
        throw err;
    }
}
