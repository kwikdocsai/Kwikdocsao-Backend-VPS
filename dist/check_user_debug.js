import { executeQuery } from './database/postgres.client.js';
async function checkUser() {
    console.log('🔍 Buscando usuário keni@k.com...');
    try {
        const res = await executeQuery("SELECT id, name, email, role, owner_id, company_id, status FROM users WHERE email = 'keni@k.com'");
        if (res.rows.length === 0) {
            console.log('❌ Usuário não encontrado.');
        }
        else {
            console.log('✅ Usuário encontrado:');
            console.table(res.rows);
        }
    }
    catch (err) {
        console.error('❌ Erro ao buscar usuário:', err);
    }
    process.exit(0);
}
checkUser();
