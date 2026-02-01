import { executeQuery } from '../database/postgres.client.js';
export const runUpdateWebhooksForceMigration = async () => {
    try {
        console.log('🔄 Executing migration: Force Update Webhooks...');
        const updates = [
            { key: 'n8n_webhook_url', value: 'https://n8n.conversio.ao/webhook-test/document-analysis' },
            { key: 'nif_webhook_url', value: 'https://n8n.conversio.ao/webhook-test/validar_nif_empresa' }
        ];
        for (const u of updates) {
            await executeQuery(`
                INSERT INTO system_settings (key, value, type, group_name, is_secret, description)
                VALUES ($1, $2, 'string', 'integrations', false, 'Webhook Updated')
                ON CONFLICT (key) DO UPDATE SET value = $2;
            `, [u.key, u.value]);
            console.log(`✅ Webhook ${u.key} updated to ${u.value}`);
        }
        console.log('✅ Migration force_update_webhooks completed.');
    }
    catch (err) {
        console.error('❌ Migration force_update_webhooks failed:', err);
    }
};
