import { executeQuery } from '../database/postgres.client.js';

export async function runBase64Migration() {
    console.log('🔧 Executando migração: Adição de coluna file_base64...');

    try {
        await executeQuery('ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_base64 TEXT;');
        await executeQuery('ALTER TABLE documents ALTER COLUMN file_base64 SET DATA TYPE TEXT;');
        console.log('✅ Coluna file_base64 preparada com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração Base64:', err);
        throw err;
    }
}
