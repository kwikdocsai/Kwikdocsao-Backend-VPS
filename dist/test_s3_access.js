import dotenv from 'dotenv';
dotenv.config();
async function testS3Access() {
    // ID from screenshot
    const tenantId = 'b805f3cf05314daa8e847b7b00cb7a15';
    const bucket = 'kwikdocsao';
    const bucketWithPrefix = `${tenantId}:${bucket}`;
    // URL de teste do ficheiro que criámos antes
    const testUrl = `https://usc1.contabostorage.com/${bucketWithPrefix}/companies/test-company-123/invoices/1120c4d1-737f-4407-99fb-a611e21c46a2_1769292870529.txt`;
    console.log('🧪 Testando acesso ao S3...');
    console.log('URL:', testUrl);
    console.log('');
    try {
        const response = await fetch(testUrl);
        console.log('Status:', response.status, response.statusText);
        if (response.ok) {
            const content = await response.text();
            console.log('✅ SUCESSO! Conteúdo:');
            console.log(content);
        }
        else {
            console.log('❌ FALHOU!');
            const error = await response.text();
            console.log('Erro:', error);
        }
    }
    catch (err) {
        console.error('❌ Erro de rede:', err.message);
    }
}
testS3Access();
