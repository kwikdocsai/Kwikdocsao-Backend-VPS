import { executeQuery } from './database/postgres.client.js';
async function checkUserFuzzy() {
    console.log('🔍 Buscando usuários semelhantes a keni@k.com...');
    try {
        const res = await executeQuery("SELECT id, name, email, role, status FROM users WHERE email ILIKE '%keni%'");
        if (res.rows.length === 0) {
            console.log('❌ Nenhum usuário encontrado (nem com ILIKE).');
        }
        else {
            console.log('✅ Usuários encontrados:');
            console.table(res.rows);
        }
    }
    catch (err) {
        console.error('❌ Erro ao buscar usuário:', err);
    }
    process.exit(0);
}
checkUserFuzzy();
