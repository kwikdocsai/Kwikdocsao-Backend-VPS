import { executeQuery } from '../database/postgres.client.js';

export async function addPricingFieldsToServerPlans() {
    console.log('🔧 Running Migration: Add Pricing Fields to Server Performance Plans...');
    try {
        await executeQuery(`
            -- Add new columns for detailed pricing information
            ALTER TABLE server_performance_plans 
            ADD COLUMN IF NOT EXISTS price_kz DECIMAL(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cost_per_analysis DECIMAL(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10,
            ADD COLUMN IF NOT EXISTS analysis_speed VARCHAR(50) DEFAULT '1x';
        `);

        // Update existing plans with realistic pricing data
        await executeQuery(`
            UPDATE server_performance_plans 
            SET 
                price_kz = CASE slug
                    WHEN 'BASIC' THEN 0
                    WHEN 'STANDARD' THEN 75000
                    WHEN 'PRO' THEN 150000
                    WHEN 'DEDICATED' THEN 350000
                    ELSE 0
                END,
                cost_per_analysis = CASE slug
                    WHEN 'BASIC' THEN 0
                    WHEN 'STANDARD' THEN 150
                    WHEN 'PRO' THEN 100
                    WHEN 'DEDICATED' THEN 50
                    ELSE 0
                END,
                max_users = CASE slug
                    WHEN 'BASIC' THEN 5
                    WHEN 'STANDARD' THEN 10
                    WHEN 'PRO' THEN 25
                    WHEN 'DEDICATED' THEN 100
                    ELSE 10
                END,
                analysis_speed = CASE slug
                    WHEN 'BASIC' THEN '1x'
                    WHEN 'STANDARD' THEN '5x'
                    WHEN 'PRO' THEN '10x'
                    WHEN 'DEDICATED' THEN '20x'
                    ELSE '1x'
                END
            WHERE slug IN ('BASIC', 'STANDARD', 'PRO', 'DEDICATED');
        `);

        console.log('   ✅ Pricing fields added and updated successfully.');
    } catch (err: any) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
