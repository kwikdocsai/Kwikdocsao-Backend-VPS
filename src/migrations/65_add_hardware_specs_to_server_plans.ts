import { executeQuery } from '../database/postgres.client.js';

export async function addHardwareSpecsToServerPlans() {
    console.log('🔧 Running Migration: Add Hardware Specs and Document Limits to Server Plans...');
    try {
        await executeQuery(`
            -- Add new columns for hardware specifications and document limits
            ALTER TABLE server_performance_plans 
            ADD COLUMN IF NOT EXISTS max_documents INTEGER DEFAULT 200,
            ADD COLUMN IF NOT EXISTS analysis_time_seconds INTEGER DEFAULT 60,
            ADD COLUMN IF NOT EXISTS gpu_specs VARCHAR(100) DEFAULT 'Shared',
            ADD COLUMN IF NOT EXISTS ram_gb INTEGER DEFAULT 4;
        `);

        // Update existing plans with realistic hardware specs
        await executeQuery(`
            UPDATE server_performance_plans 
            SET 
                max_documents = CASE slug
                    WHEN 'BASIC' THEN 200
                    WHEN 'STANDARD' THEN 500
                    WHEN 'PRO' THEN 1000
                    WHEN 'DEDICATED' THEN 5000
                    ELSE 200
                END,
                analysis_time_seconds = CASE slug
                    WHEN 'BASIC' THEN 120
                    WHEN 'STANDARD' THEN 30
                    WHEN 'PRO' THEN 15
                    WHEN 'DEDICATED' THEN 5
                    ELSE 60
                END,
                gpu_specs = CASE slug
                    WHEN 'BASIC' THEN 'Shared CPU'
                    WHEN 'STANDARD' THEN 'NVIDIA T4 (Shared)'
                    WHEN 'PRO' THEN 'NVIDIA A10 (Dedicated)'
                    WHEN 'DEDICATED' THEN 'NVIDIA A100 (Dedicated)'
                    ELSE 'Shared'
                END,
                ram_gb = CASE slug
                    WHEN 'BASIC' THEN 4
                    WHEN 'STANDARD' THEN 8
                    WHEN 'PRO' THEN 16
                    WHEN 'DEDICATED' THEN 32
                    ELSE 4
                END
            WHERE slug IN ('BASIC', 'STANDARD', 'PRO', 'DEDICATED');
        `);

        // Update features to include more details
        await executeQuery(`
            UPDATE server_performance_plans 
            SET features = CASE slug
                WHEN 'BASIC' THEN '["Velocidade 1x", "Suporte Email", "Análise Básica", "Backup Diário"]'::jsonb
                WHEN 'STANDARD' THEN '["Velocidade 5x", "Fila Dedicada", "Suporte Prioritário", "Backup em Tempo Real", "API Access"]'::jsonb
                WHEN 'PRO' THEN '["Velocidade 10x", "Instância Isolada", "Suporte 24/7", "SLA 99.9%", "API Ilimitada", "Webhooks"]'::jsonb
                WHEN 'DEDICATED' THEN '["Velocidade 20x", "Hardware Dedicado", "Suporte Premium", "SLA 99.99%", "Personalização Total", "Infraestrutura Privada"]'::jsonb
                ELSE features
            END
            WHERE slug IN ('BASIC', 'STANDARD', 'PRO', 'DEDICATED');
        `);

        console.log('   ✅ Hardware specs and document limits added successfully.');
    } catch (err: any) {
        console.error('   ❌ Migration Failed:', err.message);
    }
}
