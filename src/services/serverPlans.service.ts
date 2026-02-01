import { executeQuery } from '../database/postgres.client.js';

export interface ServerPlan {
    id: string;
    slug: string;
    name: string;
    description: string;
    monthly_credits: number;
    price_kz: number;
    analysis_cost: number;
    max_users: number;
    max_documents: number;
    analysis_speed: string;
    analysis_time_seconds: number;
    analysis_time: string;
    gpu_specs: string;
    ram_gb: number;
    cpu_cores: string;
    welcome_credits: number;
    features: string[];
    color: string;
    is_visible: boolean;
}

/**
 * Fetch all visible server plans for public display (landing page)
 */
export async function getPublicServerPlans(): Promise<ServerPlan[]> {
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
    } catch (error: any) {
        console.error('Error fetching public server plans:', error);
        throw new Error('Failed to fetch server plans');
    }
}

/**
 * Fetch all server plans (admin use)
 */
export async function getAllServerPlans(): Promise<ServerPlan[]> {
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
    } catch (error: any) {
        console.error('Error fetching all server plans:', error);
        throw new Error('Failed to fetch server plans');
    }
}

/**
 * Create a new server plan (admin only)
 */
export async function createServerPlan(plan: Partial<ServerPlan>): Promise<ServerPlan> {
    try {
        const result = await executeQuery(`
            INSERT INTO server_performance_plans (
                slug, name, description, monthly_credits, price_kz, 
                analysis_cost, max_users, max_documents, analysis_speed, 
                analysis_time_seconds, gpu_specs, ram_gb, features, color, is_visible
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            plan.slug, plan.name, plan.description, plan.monthly_credits, plan.price_kz,
            plan.analysis_cost, plan.max_users, plan.max_documents, plan.analysis_speed,
            plan.analysis_time_seconds, plan.gpu_specs, plan.ram_gb, plan.features || [],
            plan.color, plan.is_visible ?? true
        ]);

        return result.rows[0];
    } catch (error: any) {
        console.error('Error creating server plan:', error);
        throw new Error('Failed to create server plan');
    }
}

/**
 * Update an existing server plan (admin only)
 */
export async function updateServerPlan(id: string, updates: Partial<ServerPlan>): Promise<ServerPlan> {
    try {
        const setClause = Object.keys(updates)
            .filter(key => key !== 'id')
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');

        const values = Object.keys(updates)
            .filter(key => key !== 'id')
            .map(key => (updates as any)[key]);

        const result = await executeQuery(`
            UPDATE server_performance_plans 
            SET ${setClause}, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id, ...values]);

        if (result.rowCount === 0) throw new Error('Plan not found');
        return result.rows[0];
    } catch (error: any) {
        console.error('Error updating server plan:', error);
        throw new Error('Failed to update server plan');
    }
}

/**
 * Delete a server plan (admin only)
 */
export async function deleteServerPlan(id: string): Promise<void> {
    try {
        const result = await executeQuery('DELETE FROM server_performance_plans WHERE id = $1', [id]);
        if (result.rowCount === 0) throw new Error('Plan not found');
    } catch (error: any) {
        console.error('Error deleting server plan:', error);
        throw new Error('Failed to delete server plan');
    }
}
