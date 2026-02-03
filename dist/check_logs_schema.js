import { executeQuery } from './database/postgres.client.js';
async function checkParams() {
    try {
        const res = await executeQuery(`SELECT * FROM system_logs LIMIT 1`);
        console.log('✅ Tabela system_logs existe. Colunas:', res.fields.map(f => f.name));
    }
    catch (err) {
        console.log('❌ Tabela system_logs não encontrada ou erro:', err.message);
    }
    process.exit(0);
}
checkParams();
