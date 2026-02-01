import dotenv from 'dotenv';
dotenv.config();
async function testUpload() {
    console.log('🚀 Iniciando Teste de Upload S3 (Contabo)...');
    // Import dynamically AFTER dotenv.config()
    const { storageService } = await import('./services/storage.service.js');
    try {
        // Dados de teste
        const testCompanyId = 'test-company-123';
        const testCategory = 'invoices';
        const dummyContent = Buffer.from('Este é um arquivo de teste para verificar a integração com o Contabo S3.');
        const fileName = 'teste_conexao.txt';
        const mimeType = 'text/plain';
        console.log('--- Configurações Detectadas ---');
        console.log('Endpoint:', process.env.S3_ENDPOINT);
        console.log('Bucket:', process.env.S3_BUCKET);
        console.log('Access Key:', process.env.S3_ACCESS_KEY ? '****' + process.env.S3_ACCESS_KEY.slice(-4) : 'NÃO DEFINIDA');
        console.log('-------------------------------');
        const result = await storageService.uploadFile(dummyContent, fileName, mimeType, testCompanyId, 'Test Company', testCategory);
        console.log('\n✅ UPLOAD CONCLUÍDO COM SUCESSO!');
        console.log('URL do Arquivo:', result.url);
        console.log('Caminho no Storage:', result.path);
        console.log('Bucket:', result.bucket);
        console.log('\n🧪 Verificando acesso público...');
        try {
            const response = await fetch(result.url);
            console.log('Status do Acesso:', response.status, response.statusText);
            if (response.ok) {
                console.log('✅ SUCESSO! O ficheiro está acessível publicamente.');
            }
            else {
                console.log('❌ FALHOU! O ficheiro retornou erro no acesso público.');
            }
        }
        catch (fetchErr) {
            console.error('❌ Erro de rede ao tentar aceder à URL:', fetchErr.message);
        }
        process.exit(0);
    }
    catch (err) {
        console.error('\n❌ ERRO NO TESTE:');
        console.error(err.message);
        if (err.stack)
            console.error(err.stack);
        process.exit(1);
    }
}
testUpload();
