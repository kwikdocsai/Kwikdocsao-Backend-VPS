
import dotenv from 'dotenv';
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

dotenv.config();

async function diagS3() {
    const accessKey = process.env.S3_ACCESS_KEY || '';
    const secretKey = process.env.S3_SECRET_KEY || '';
    const endpoint = process.env.S3_ENDPOINT || 'https://usc1.contabostorage.com';
    const region = process.env.S3_REGION || 'usc1';

    console.log('--- S3 DIAGNOSTIC ---');
    console.log('Endpoint:', endpoint);
    console.log('Region:', region);
    console.log('Access Key ID:', accessKey);

    const client = new S3Client({
        endpoint: endpoint,
        region: region,
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
        },
        forcePathStyle: true,
    });

    try {
        console.log('Tentando listar buckets...');
        const command = new ListBucketsCommand({});
        const response = await client.send(command);
        console.log('✅ CONEXÃO ESTABELECIDA!');
        const buckets = response.Buckets?.map(b => b.Name) || [];
        console.log('Buckets encontrados:', buckets);

        if (buckets.length > 0) {
            const bucketToTest = buckets[0];
            console.log(`\nTentando simples PutObject no bucket: ${bucketToTest}...`);
            const { PutObjectCommand } = await import("@aws-sdk/client-s3");
            const putCmd = new PutObjectCommand({
                Bucket: bucketToTest,
                Key: 'test-diag.txt',
                Body: 'Conteúdo de teste via diagnóstico',
                ContentType: 'text/plain'
            });
            await client.send(putCmd);
            console.log(`✅ UPLOAD SIMPLES FUNCIONOU no bucket ${bucketToTest}!`);

            // Try with prefix just in case
            const prefixedBucket = `${accessKey}:${bucketToTest}`;
            console.log(`\nTentando simples PutObject no bucket PREFIXADO: ${prefixedBucket}...`);
            const putCmdPref = new PutObjectCommand({
                Bucket: prefixedBucket,
                Key: 'test-diag-pref.txt',
                Body: 'Conteúdo de teste via diagnóstico pref',
                ContentType: 'text/plain'
            });
            try {
                await client.send(putCmdPref);
                console.log(`✅ UPLOAD PREFIXADO FUNCIONOU!`);
            } catch (e: any) {
                console.log(`❌ UPLOAD PREFIXADO FALHOU: ${e.message}`);
            }
        }
    } catch (err: any) {
        console.error('❌ FALHA NA CONEXÃO:');
        console.error('Mensagem:', err.message);
        if (err.$response) {
            console.error('Corpo da Resposta:', err.$response.body);
            // S3 errors are sometimes readable in response body if it's JSON/XML
        }
    }
}

diagS3();
