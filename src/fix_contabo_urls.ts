
import dotenv from 'dotenv';
dotenv.config();
import { executeQuery } from './database/postgres.client.js';
import { S3Client, PutObjectAclCommand } from "@aws-sdk/client-s3";

async function fixAllFileUrls() {
    console.log('🔧 Corrigindo TODAS as URLs e permissões para formato Contabo correto...\n');

    const accessKey = process.env.S3_ACCESS_KEY || '';
    const secretKey = process.env.S3_SECRET_KEY || '';
    const tenantId = process.env.S3_TENANT_ID || accessKey;
    const endpoint = process.env.S3_ENDPOINT || 'https://usc1.contabostorage.com';
    const region = process.env.S3_REGION || 'usc1';

    const client = new S3Client({
        endpoint: endpoint,
        region: region,
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
        },
        forcePathStyle: true,
    });

    console.log(`📋 Configuração:`);
    console.log(`   Endpoint: ${endpoint}`);
    console.log(`   Tenant ID: ${tenantId.substring(0, 8)}...`);
    console.log(`   Formato: {endpoint}/{tenantId}:{bucket}/{path}\n`);

    // Buscar TODOS os documentos com storage_path
    const result = await executeQuery(
        `SELECT id, file_name, file_url, storage_path, bucket_name 
         FROM documents 
         WHERE storage_path IS NOT NULL
         ORDER BY created_at DESC`
    );

    console.log(`📊 Encontrados ${result.rows.length} documentos com storage_path\n`);

    if (result.rows.length === 0) {
        console.log('✅ Nenhum documento encontrado!');
        process.exit(0);
    }

    let fixed = 0;
    let skipped = 0;

    for (const doc of result.rows) {
        const bucket = doc.bucket_name || 'kwikdocsao';
        const bucketWithPrefix = `${tenantId}:${bucket}`;
        const correctUrl = `${endpoint}/${bucketWithPrefix}/${doc.storage_path}`;

        console.log(`📝 ${doc.file_name}`);
        console.log(`   ID: ${doc.id.substring(0, 8)}...`);

        // 1. Tentar tornar público no S3
        try {
            console.log(`   🔓 Definindo permissão pública no S3...`);
            const aclCmd = new PutObjectAclCommand({
                Bucket: bucket,
                Key: doc.storage_path,
                ACL: 'public-read'
            });
            await client.send(aclCmd);
            console.log(`   ✅ S3 ACL atualizada.`);
        } catch (s3Err: any) {
            console.log(`   ⚠️ Falha na ACL: ${s3Err.message}`);
        }

        // 2. Atualizar file_url se necessário
        if (doc.file_url !== correctUrl) {
            console.log(`   🔗 Atualizando URL na BD...`);
            console.log(`     Antigo: ${doc.file_url || 'NULL'}`);
            console.log(`     Novo: ${correctUrl}`);
            await executeQuery(
                `UPDATE documents SET file_url = $1 WHERE id = $2`,
                [correctUrl, doc.id]
            );
            console.log(`   ✅ DB atualizada.`);
            fixed++;
        } else {
            console.log(`   ⏭️  URL já estava correta na BD.`);
            skipped++;
        }
        console.log('');
    }

    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Corrigidos (DB): ${fixed}`);
    console.log(`   ⏭️  Já corretos (DB): ${skipped}`);
    console.log(`   📦 Total: ${result.rows.length}`);
    console.log('\n🎉 Migração e Correção concluída com sucesso!');

    process.exit(0);
}

fixAllFileUrls().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
