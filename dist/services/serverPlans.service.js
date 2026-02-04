import { executeQuery } from '../database/postgres.client.js';
/**
 * Fetch all visible server plans for public display (landing page)
 */
export async function getPublicServerPlans() {
    try {
        const result = await executeQuery(`
            SELECT 
                id, 
                slug, 
                name, 
                description, 
                monthly_credits,
                price_kz,
                analysis_cost,
                max_users,
                max_documents,
                analysis_speed,
                analysis_time_seconds,
                analysis_time,
                gpu_specs,
                ram_gb,
                cpu_cores,
                welcome_credits,
                features, 
                color, 
                is_visible
            FROM server_performance_plans
            WHERE is_visible = true
            ORDER BY monthly_credits ASC
        `);
        return result.rows.map(p => ({
            ...p,
            features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features,
            analysis_cost: parseFloat(p.analysis_cost || 0)
        }));
    }
    catch (error) {
        console.error('Error fetching public server plans:', error);
        throw new Error('Failed to fetch server plans');
    }
}
/**
 * Fetch all server plans (admin use)
 */
export async function getAllServerPlans() {
    try {
        const result = await executeQuery(`
            SELECT 
                id, 
                slug, 
                name, 
                description, 
                monthly_credits,
                price_kz,
                analysis_cost,
                max_users,
                max_documents,
                analysis_speed,
                analysis_time_seconds,
                analysis_time,
                gpu_specs,
                ram_gb,
                cpu_cores,
                welcome_credits,
                features, 
                color, 
                is_visible
            FROM server_performance_plans
            ORDER BY monthly_credits ASC
        `);
        return result.rows.map(p => ({
            ...p,
            features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features,
            analysis_cost: parseFloat(p.analysis_cost || 0)
        }));
    }
    catch (error) {
        console.error('Error fetching all server plans:', error);
        throw new Error('Failed to fetch server plans');
    }
}
/**
 * Create a new server plan (admin only)
 */
export async function createServerPlan(plan) {
    try {
        const result = await executeQuery(`
            INSERT INTO server_performance_plans (
                slug, name, description, monthly_credits, price_kz, 
                analysis_cost, max_users, max_documents, analysis_speed, 
                analysis_time_seconds, gpu_specs, ram_gb, features, color, is_visible, welcome_credits
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
        `, [
            plan.slug, plan.name, plan.description, plan.monthly_credits, plan.price_kz,
            plan.analysis_cost, plan.max_users, plan.max_documents, plan.analysis_speed,
            plan.analysis_time_seconds, plan.gpu_specs, plan.ram_gb, JSON.stringify(plan.features || []),
            plan.color, plan.is_visible ?? true, plan.welcome_credits || 0
        ]);
        return result.rows[0];
    }
    catch (error) {
        console.error('Error creating server plan:', error);
        throw new Error('Failed to create server plan');
    }
}
/**
 * Update an existing server plan (admin only)
 */
export async function updateServerPlan(id, updates) {
    try {
        // Allowed columns to prevent SQL injection or "column not found" errors
        const allowedColumns = [
            'slug', 'name', 'description', 'monthly_credits', 'price_kz',
            'analysis_cost', 'max_users', 'max_documents', 'analysis_speed',
            'analysis_time_seconds', 'gpu_specs', 'ram_gb', 'features',
            'color', 'is_visible', 'welcome_credits', 'cpu_cores'
        ];
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedColumns.includes(key)) {
                // Special handling for features array -> JSON string
                if (key === 'features' && Array.isArray(updates[key])) {
                    filteredUpdates[key] = JSON.stringify(updates[key]);
                }
                else {
                    filteredUpdates[key] = updates[key];
                }
            }
        });
        if (Object.keys(filteredUpdates).length === 0) {
            throw new Error('No valid fields to update');
        }
        const setClause = Object.keys(filteredUpdates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        const values = Object.values(filteredUpdates);
        const result = await executeQuery(`
            UPDATE server_performance_plans 
            SET ${setClause}, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, ...values]);
        if (result.rowCount === 0)
            throw new Error('Plan not found');
        return result.rows[0];
    }
    catch (error) {
        console.error('Error updating server plan:', error);
        throw new Error('Failed to update server plan: ' + error.message);
    }
}
/**
 * Delete a server plan (admin only)
 */
export async function deleteServerPlan(id) {
    try {
        const result = await executeQuery('DELETE FROM server_performance_plans WHERE id = $1', [id]);
        if (result.rowCount === 0)
            throw new Error('Plan not found');
    }
    catch (error) {
        console.error('Error deleting server plan:', error);
        throw new Error('Failed to delete server plan');
    }
}
