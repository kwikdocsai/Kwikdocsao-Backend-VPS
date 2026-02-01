import dotenv from 'dotenv';
dotenv.config();
import { executeQuery } from './database/postgres.client.js';

async function fixFileUrls() {
    console.log('🔧 Corrigindo file_url para documentos com storage_path...\n');

    // 1. Buscar documentos com storage_path mas file_url incorreto
    const result = await executeQuery(
        `SELECT id, file_name, file_url, storage_path, bucket_name 
         FROM documents 
         WHERE storage_path IS NOT NULL 
         AND (file_url IS NULL OR file_url = 'DB_STORED' OR file_url = 'CLOUD_STORED')
         ORDER BY created_at DESC
         LIMIT 100`
    );

    console.log(`📊 Encontrados ${result.rows.length} documentos para corrigir\n`);

    if (result.rows.length === 0) {
        console.log('✅ Nenhum documento precisa de correção!');
        process.exit(0);
    }

    const endpoint = process.env.S3_ENDPOINT || 'https://usc1.contabostorage.com';
    let fixed = 0;

    for (const doc of result.rows) {
        const bucket = doc.bucket_name || 'kwikdocsao';
        const correctUrl = `${endpoint}/${bucket}/${doc.storage_path}`;

        console.log(`📝 ${doc.file_name}`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Antigo: ${doc.file_url}`);
        console.log(`   Novo: ${correctUrl}`);

        // Atualizar file_url
        await executeQuery(
            `UPDATE documents SET file_url = $1 WHERE id = $2`,
            [correctUrl, doc.id]
        );

        fixed++;
        console.log(`   ✅ Corrigido!\n`);
    }

    console.log(`\n🎉 Total corrigido: ${fixed} documentos`);
    console.log('✅ Migração concluída com sucesso!');

    process.exit(0);
}

fixFileUrls().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
