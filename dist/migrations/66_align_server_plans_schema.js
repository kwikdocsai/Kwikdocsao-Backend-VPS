import { executeQuery } from '../database/postgres.client.js';
export async function runAlignServerPlansSchemaMigration() {
    console.log('🔧 Running Migration: Align Server Plans Schema (Rename & Cleanup)...');
    try {
        // 1. Rename cost_per_analysis to analysis_cost if it exists
        await executeQuery(`
            DO $$ 
            BEGIN 
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'server_performance_plans' AND column_name = 'cost_per_analysis') THEN
                    ALTER TABLE server_performance_plans RENAME COLUMN cost_per_analysis TO analysis_cost;
                END IF;
            END $$;
        `);
        // 2. Ensure all required columns exist with correct types
        await executeQuery(`
            ALTER TABLE server_performance_plans 
            ALTER COLUMN analysis_cost TYPE DECIMAL(10, 2),
            ADD COLUMN IF NOT EXISTS welcome_credits INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cpu_cores VARCHAR(50) DEFAULT '1 vCPU',
            ADD COLUMN IF NOT EXISTS analysis_time VARCHAR(50) DEFAULT '60s';
        `);
        // 3. Update values based on the provided screenshot and code logic
        await executeQuery(`
            UPDATE server_performance_plans 
            SET 
                analysis_cost = CASE slug
                    WHEN 'BASIC' THEN 1.00
                    WHEN 'STANDARD' THEN 1.00
                    WHEN 'PRO' THEN 2.00
                    WHEN 'DEDICATED' THEN 3.00
                    ELSE analysis_cost
                END,
                welcome_credits = CASE slug
                    WHEN 'BASIC' THEN 0
                    WHEN 'STANDARD' THEN 15
                    WHEN 'PRO' THEN 30
                    WHEN 'DEDICATED' THEN 100
                    ELSE welcome_credits
                END,
                cpu_cores = CASE slug
                    WHEN 'BASIC' THEN '1 vCPU'
                    WHEN 'STANDARD' THEN '4 vCPU'
                    WHEN 'PRO' THEN '8 vCPU'
                    WHEN 'DEDICATED' THEN '16 vCPU'
                    ELSE cpu_cores
                END,
                analysis_time = CASE slug
                    WHEN 'BASIC' THEN '120s'
                    WHEN 'STANDARD' THEN '30s'
                    WHEN 'PRO' THEN '15s'
                    WHEN 'DEDICATED' THEN '5s'
                    ELSE analysis_time
                END
            WHERE slug IN ('BASIC', 'STANDARD', 'PRO', 'DEDICATED');
        `);
        console.log('   ✅ Server plans schema aligned and missing columns (welcome_credits, cpu_cores, analysis_time) added/updated.');
    }
    catch (err) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
