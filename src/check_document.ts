import dotenv from 'dotenv';
dotenv.config();
import { executeQuery } from './database/postgres.client.js';

async function checkDocument() {
    const docId = 'b885f762-70c0-4dec-ab9f-23df818c4736';

    console.log('🔍 Verificando documento:', docId);

    const result = await executeQuery(
        `SELECT id, file_name, file_url, storage_path, bucket_name, created_at, status 
         FROM documents WHERE id = $1`,
        [docId]
    );

    if (result.rows.length === 0) {
        console.log('❌ Documento não encontrado!');
        return;
    }

    const doc = result.rows[0];
    console.log('\n📄 Dados do Documento:');
    console.log('  - Nome:', doc.file_name);
    console.log('  - Status:', doc.status);
    console.log('  - file_url:', doc.file_url || 'NULL');
    console.log('  - storage_path:', doc.storage_path || 'NULL');
    console.log('  - bucket_name:', doc.bucket_name || 'NULL');
    console.log('  - Criado em:', doc.created_at);

    if (!doc.file_url || doc.file_url === 'DB_STORED') {
        console.log('\n⚠️  PROBLEMA: file_url não está configurado!');
        console.log('   Este documento foi criado antes da migração S3.');
        console.log('   Solução: Re-enviar o documento ou fazer upload novamente.');
    } else {
        console.log('\n✅ file_url está configurado corretamente!');
        console.log('   URL:', doc.file_url);
    }

    process.exit(0);
}

checkDocument().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
