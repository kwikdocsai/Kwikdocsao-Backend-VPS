import { executeQuery } from './database/postgres.client.js';
async function checkOwner() {
    console.log('🔍 Buscando detalhes do Owner 3b2a3a2e-4457-4bbb-8840-8337ab9b48ed...');
    try {
        const res = await executeQuery("SELECT id, name, email, role, company_id FROM users WHERE id = '3b2a3a2e-4457-4bbb-8840-8337ab9b48ed'");
        if (res.rows.length === 0) {
            console.log('❌ Owner não encontrado.');
        }
        else {
            console.log('✅ Owner encontrado:');
            console.table(res.rows);
        }
    }
    catch (err) {
        console.error('❌ Erro ao buscar owner:', err);
    }
    process.exit(0);
}
checkOwner();
