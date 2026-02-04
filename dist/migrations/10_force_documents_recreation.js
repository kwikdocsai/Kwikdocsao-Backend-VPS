import { executeQuery } from '../database/postgres.client.js';
export async function runForceDocumentsTableRecreation() {
    console.log('⚠️ FORÇA: Recriando tabela documents...');
    try {
        // 1. DROP a tabela antiga (CUIDADO: Isso apaga dados!)
        console.log('🗑️ Removendo tabela documents antiga...');
        await executeQuery('DROP TABLE IF EXISTS documents CASCADE;');
        // 2. Criar tabela nova com schema CORRETO
        console.log('✨ Criando tabela documents nova...');
        await executeQuery(`
            CREATE TABLE documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
                uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
                file_name TEXT NOT NULL,
                file_url TEXT,
                file_base64 TEXT,
                status TEXT DEFAULT 'PROCESSING',
                type TEXT DEFAULT 'UNKNOWN',
                data JSONB DEFAULT '{}',
                raw_data JSONB DEFAULT '{}',
                raw_n8n_response JSONB DEFAULT '{}',
                full_analysis JSONB DEFAULT '{}',
                raw_text TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                completed_at TIMESTAMP WITH TIME ZONE
            );
        `);
        // 3. Criar índices para performance
        await executeQuery('CREATE INDEX idx_documents_company ON documents(company_id);');
        await executeQuery('CREATE INDEX idx_documents_status ON documents(status);');
        await executeQuery('CREATE INDEX idx_documents_created_at ON documents(created_at DESC);');
        console.log('✅ Tabela documents recriada com sucesso!');
    }
    catch (err) {
        console.error('❌ Erro ao recriar tabela documents:', err);
        throw err;
    }
}
