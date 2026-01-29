import { executeQuery } from '../database/postgres.client.js';

export const runCreateAiAlertsTableMigration = async () => {
    try {
        console.log('Running migration: Create AI Alerts Table...');

        await executeQuery(`
            CREATE TABLE IF NOT EXISTS ai_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                company_id UUID NOT NULL,
                agent_name TEXT NOT NULL CHECK (agent_name IN ('Sentinel', 'Predictor', 'Optimizer', 'Watchdog')),
                severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO', 'OPPORTUNITY')),
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata JSONB,
                is_resolved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_ai_alerts_company_id ON ai_alerts(company_id);
            CREATE INDEX IF NOT EXISTS idx_ai_alerts_created_at ON ai_alerts(created_at);
        `);

        console.log('Migration completed: ai_alerts table created/verified.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
};
