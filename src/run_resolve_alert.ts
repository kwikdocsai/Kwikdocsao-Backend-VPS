
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
    user: 'conversioao',
    password: 'Mercedes@g63',
    host: '173.249.39.97',
    port: 5433,
    database: 'kwikdocsai',
    ssl: false
});

async function resolveAlert(alertId: string, actionType: string) {
    try {
        console.log(`🛠️ Processando Resolução: ${actionType} para o Alerta: ${alertId}`);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const alertRes = await client.query('SELECT document_id FROM ai_alerts WHERE id = $1', [alertId]);
            if (alertRes.rowCount === 0) throw new Error('Alerta não encontrado.');

            const docId = alertRes.rows[0].document_id;

            if (actionType === 'ACEITAR_RISCO') {
                // Marca o alerta como resolvido e adiciona tag de risco aceito no documento
                await client.query(`
                    UPDATE documents 
                    SET data = data || jsonb_build_object('risk_accepted', true, 'data_resolucao', NOW())
                    WHERE id = $1
                `, [docId]);

                await client.query(`
                    UPDATE ai_alerts 
                    SET is_resolved = true, resolution_action = $1
                    WHERE id = $2
                `, [actionType, alertId]);

            } else if (actionType === 'IGNORAR') {
                // Apenas silencia o alerta para não aparecer na lista ativa
                await client.query(`
                    UPDATE ai_alerts 
                    SET is_resolved = true, resolution_action = $1
                    WHERE id = $2
                `, [actionType, alertId]);

            } else if (actionType === 'CORRECAO_MANUAL') {
                // Identifica o documento, marca como COMPLETED e limpa TODOS os alertas associados
                await client.query(`
                    UPDATE documents 
                    SET status = 'COMPLETED'
                    WHERE id = $1
                `, [docId]);

                await client.query(`
                    UPDATE ai_alerts 
                    SET is_resolved = true, resolution_action = $1
                    WHERE document_id = $2
                `, [actionType, docId]);
            } else {
                throw new Error('Ação inválida. Use ACEITAR_RISCO, IGNORAR ou CORRECAO_MANUAL.');
            }

            await client.query('COMMIT');
            console.log(`✅ Ação ${actionType} executada com sucesso.`);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error('❌ Erro na resolução:', err.message);
    } finally {
        await pool.end();
    }
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Uso: npx tsx src/run_resolve_alert.ts <alert_id> <ACEITAR_RISCO|RESOLVER_DUPLICADO>');
} else {
    resolveAlert(args[0], args[1]);
}
