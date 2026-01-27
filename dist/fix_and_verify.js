import { executeQuery } from './database/postgres.client.js';
async function fixAndVerify() {
    console.log('🧹 Limpando usuário keni@k.com...');
    await executeQuery("DELETE FROM users WHERE email ILIKE '%keni@k.com%'");
    console.log('✅ Usuário deletado.');
    console.log('🧪 Testando atualização de prompts para o Admin...');
    const adminId = '3b2a3a2e-4457-4bbb-8840-8337ab9b48ed';
    // Simulate API call logic
    try {
        const testPrompt = 'TEST_PROMPT_' + Date.now();
        await executeQuery(`UPDATE users SET auditor_prompt = $1 WHERE id = $2`, [testPrompt, adminId]);
        console.log('✅ Prompt atualizado via SQL.');
        // Verify
        const res = await executeQuery('SELECT auditor_prompt FROM users WHERE id = $1', [adminId]);
        console.log('🧐 Valor no Banco:', res.rows[0]?.auditor_prompt);
        if (res.rows[0]?.auditor_prompt === testPrompt) {
            console.log('✅ Persistência de prompts CONFIRMADA.');
        }
        else {
            console.error('❌ Falha na persistência.');
        }
    }
    catch (err) {
        console.error('❌ Erro:', err);
    }
    process.exit(0);
}
fixAndVerify();
