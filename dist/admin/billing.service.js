import { executeQuery } from '../database/postgres.client.js';
export class BillingService {
    async getGlobalFinanceStats() {
        const result = await executeQuery(`
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED' AND created_at > now() - interval '30 days'), 0) as mrr,
                COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING_APPROVAL'), 0) as pending_amount,
                COALESCE(SUM(credits) FILTER (WHERE type = 'TOPUP' AND status = 'COMPLETED' AND created_at > now() - interval '30 days'), 0) as credits_sold,
                COUNT(*) FILTER (WHERE type = 'PLAN_UPGRADE' AND status = 'COMPLETED' AND created_at > now() - interval '30 days') as new_subscriptions,
                COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') as pending_count,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as processed_count
            FROM transactions
        `);
        const docStats = await executeQuery(`
            SELECT COUNT(*) as consumed FROM documents WHERE status = 'COMPLETED' AND created_at > now() - interval '30 days'
        `);
        const userStats = await executeQuery(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE last_login > now() - interval '7 days') as active
            FROM users
        `);
        const stats = result.rows[0];
        return {
            mrr: stats.mrr,
            pending_payments: stats.pending_amount,
            pending_count: parseInt(stats.pending_count || '0'),
            processed_count: parseInt(stats.processed_count || '0'),
            credits_sold: stats.credits_sold,
            new_subscriptions: stats.new_subscriptions,
            consumed_credits: docStats.rows[0].consumed,
            total_users: userStats.rows[0].total,
            active_users: userStats.rows[0].active,
            churn_rate: '1.2%'
        };
    }
    async getRecentTransactions(limit = 10) {
        const result = await executeQuery(`
            SELECT 
                t.id,
                c.name as company_name,
                t.type,
                t.credits,
                t.amount,
                t.currency,
                t.created_at as date,
                t.status
            FROM transactions t
            LEFT JOIN companies c ON t.company_id = c.id
            ORDER BY t.created_at DESC
            LIMIT $1
        `, [limit]);
        return result.rows.map(row => ({
            id: row.id.substring(0, 8).toUpperCase(),
            company: row.company_name || 'Sistema/Global',
            type: row.type,
            amount: row.type === 'TOPUP' ? `${row.credits} Créditos` : 'Assinatura',
            value: `${row.currency} ${parseFloat(row.amount).toLocaleString()}`,
            date: row.date,
            status: row.status
        }));
    }
    async getPlanDistribution() {
        const result = await executeQuery(`
            SELECT 
                p.name,
                p.color,
                COUNT(c.id) as count
            FROM plans p
            LEFT JOIN companies c ON c.plan_id = p.id
            GROUP BY p.name, p.color
        `);
        const total = result.rows.reduce((acc, row) => acc + parseInt(row.count), 0);
        return result.rows.map(row => ({
            name: row.name,
            count: parseInt(row.count),
            percentage: total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0,
            color: row.color || 'bg-slate-500'
        }));
    }
    // CRUD para Planos
    async getAllPlans() {
        const result = await executeQuery('SELECT * FROM plans ORDER BY price_credits ASC');
        return result.rows;
    }
    async createPlan(data) {
        const { name, price_credits, included_credits, user_limit, analysis_cost, color, features } = data;
        const result = await executeQuery(`INSERT INTO plans (name, price_credits, included_credits, user_limit, analysis_cost, color, features)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [name.toUpperCase(), price_credits, included_credits, user_limit, analysis_cost, color, JSON.stringify(features || [])]);
        return result.rows[0];
    }
    async updatePlan(id, data) {
        const { name, price_credits, included_credits, user_limit, analysis_cost, color, features, is_active } = data;
        const result = await executeQuery(`UPDATE plans SET 
                name = $1, price_credits = $2, included_credits = $3, user_limit = $4, 
                analysis_cost = $5, color = $6, features = $7, is_active = $8,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 RETURNING *`, [name.toUpperCase(), price_credits, included_credits, user_limit, analysis_cost, color, JSON.stringify(features || []), is_active, id]);
        return result.rows[0];
    }
    async deletePlan(id) {
        // Soft delete: just mark as inactive
        await executeQuery('UPDATE plans SET is_active = false WHERE id = $1', [id]);
        return { success: true };
    }
    async getFinancialInsights() {
        const currentMonth = await executeQuery(`
            SELECT SUM(amount) as total FROM transactions 
            WHERE status = 'COMPLETED' AND created_at > now() - interval '30 days'
        `);
        const lastMonth = await executeQuery(`
            SELECT SUM(amount) as total FROM transactions 
            WHERE status = 'COMPLETED' AND created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'
        `);
        const currentTotal = parseFloat(currentMonth.rows[0].total || 0);
        const lastTotal = parseFloat(lastMonth.rows[0].total || 0);
        let growth = 0;
        if (lastTotal > 0) {
            growth = Math.round(((currentTotal - lastTotal) / lastTotal) * 100);
        }
        return {
            growth,
            message: `A receita ${growth >= 0 ? 'cresceu' : 'caiu'} **${Math.abs(growth)}%** este mês em comparação ao período anterior.`
        };
    }
    // ==================== CREDIT PACKAGES ====================
    async getAllCreditPackages() {
        const result = await executeQuery('SELECT * FROM credit_packages WHERE is_active = true ORDER BY credits ASC');
        return result.rows;
    }
    async createCreditPackage(data) {
        const { name, credits, price, bonus_credits, color, description } = data;
        const result = await executeQuery(`INSERT INTO credit_packages (name, credits, price, bonus_credits, color, description) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [name, credits, price, bonus_credits || 0, color || 'bg-blue-500', description]);
        return result.rows[0];
    }
    async updateCreditPackage(id, data) {
        const { name, credits, price, bonus_credits, color, description, is_active } = data;
        const result = await executeQuery(`UPDATE credit_packages SET 
                name = $1, credits = $2, price = $3, bonus_credits = $4, 
                color = $5, description = $6, is_active = $7, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $8 RETURNING *`, [name, credits, price, bonus_credits, color, description, is_active, id]);
        return result.rows[0];
    }
    async deleteCreditPackage(id) {
        await executeQuery('UPDATE credit_packages SET is_active = false WHERE id = $1', [id]);
        return { success: true };
    }
    // ==================== OPERATIONAL COSTS ====================
    async getOperationalCosts() {
        const result = await executeQuery(`
            SELECT * FROM operational_costs 
            WHERE effective_until IS NULL OR effective_until > CURRENT_TIMESTAMP
            ORDER BY resource_type, effective_from DESC
        `);
        return result.rows;
    }
    async setOperationalCost(data) {
        const { resource_type, cost_per_unit, unit_name, notes } = data;
        // Encerrar custo anterior
        await executeQuery(`UPDATE operational_costs 
             SET effective_until = CURRENT_TIMESTAMP 
             WHERE resource_type = $1 AND effective_until IS NULL`, [resource_type]);
        // Inserir novo custo
        const result = await executeQuery(`INSERT INTO operational_costs (resource_type, cost_per_unit, unit_name, notes, effective_from) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *`, [resource_type, cost_per_unit, unit_name, notes]);
        return result.rows[0];
    }
    // ==================== ADVANCED METRICS ====================
    async getCompanyProfitability() {
        const result = await executeQuery(`
            SELECT 
                c.id,
                c.name,
                p.name as plan_name,
                p.price_credits as monthly_fee,
                COUNT(DISTINCT ac.id) as total_analyses,
                COALESCE(SUM(ac.credits_charged), 0) as total_credits_consumed,
                COALESCE(SUM(ac.total_operational_cost_aoa), 0) as total_operational_cost,
                COALESCE(SUM(ac.margin_aoa), 0) as total_margin,
                COALESCE(AVG(ac.margin_percentage), 0) as avg_margin_percentage,
                (COALESCE(p.price_credits, 0) - COALESCE(SUM(ac.total_operational_cost_aoa), 0)) as net_profit
            FROM companies c
            LEFT JOIN plans p ON c.plan_id = p.id
            LEFT JOIN analysis_costs ac ON ac.company_id = c.id AND ac.created_at > now() - interval '30 days'
            WHERE c.status = 'ACTIVE'
            GROUP BY c.id, c.name, p.name, p.price_credits
            ORDER BY net_profit DESC
        `);
        return result.rows;
    }
    async getCreditConsumptionTrends() {
        const result = await executeQuery(`
            SELECT 
                DATE_TRUNC('day', created_at) as date,
                SUM(credits_charged) as credits_consumed,
                COUNT(*) as analyses_count,
                AVG(margin_percentage) as avg_margin
            FROM analysis_costs
            WHERE created_at > now() - interval '30 days'
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY date ASC
        `);
        return result.rows;
    }
    async getMonthlySnapshot(month) {
        const result = await executeQuery('SELECT * FROM financial_snapshots WHERE snapshot_month = $1', [month]);
        return result.rows[0];
    }
    async generateMonthlySnapshot() {
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);
        const mrr = await this.calculateMRR();
        const arr = mrr * 12;
        const churnData = await this.calculateChurnRate();
        const costData = await this.calculateOperationalCosts();
        const result = await executeQuery(`
            INSERT INTO financial_snapshots (
                snapshot_month, mrr, arr, total_companies, active_companies, 
                churned_companies, churn_rate, new_companies, total_credits_sold,
                total_credits_consumed, total_revenue, total_operational_cost,
                gross_margin, gross_margin_percentage, total_analyses, avg_margin_per_analysis
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (snapshot_month) DO UPDATE SET
                mrr = EXCLUDED.mrr,
                arr = EXCLUDED.arr,
                total_companies = EXCLUDED.total_companies,
                active_companies = EXCLUDED.active_companies,
                churned_companies = EXCLUDED.churned_companies,
                churn_rate = EXCLUDED.churn_rate,
                total_credits_consumed = EXCLUDED.total_credits_consumed,
                total_revenue = EXCLUDED.total_revenue,
                total_operational_cost = EXCLUDED.total_operational_cost,
                gross_margin = EXCLUDED.gross_margin,
                gross_margin_percentage = EXCLUDED.gross_margin_percentage,
                total_analyses = EXCLUDED.total_analyses,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [
            currentMonth, mrr, arr, churnData.total, churnData.active,
            churnData.churned, churnData.rate, churnData.new_companies,
            costData.credits_sold, costData.credits_consumed, costData.revenue,
            costData.operational_cost, costData.margin, costData.margin_percentage,
            costData.total_analyses, costData.avg_margin_per_analysis
        ]);
        return result.rows[0];
    }
    // ==================== HELPERS ====================
    async calculateMRR() {
        const result = await executeQuery(`
            SELECT COALESCE(SUM(p.price_credits), 0) as mrr
            FROM companies c
            LEFT JOIN plans p ON c.plan_id = p.id
            WHERE c.status = 'ACTIVE'
        `);
        return parseFloat(result.rows[0].mrr || 0);
    }
    async calculateChurnRate() {
        const result = await executeQuery(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
                COUNT(*) FILTER (WHERE status = 'SUSPENDED' AND updated_at > now() - interval '30 days') as churned,
                COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') as new_companies,
                COUNT(*) as total
            FROM companies
        `);
        const data = result.rows[0];
        const churnRate = data.active > 0 ? (data.churned / data.active) * 100 : 0;
        return {
            active: parseInt(data.active),
            churned: parseInt(data.churned),
            new_companies: parseInt(data.new_companies),
            total: parseInt(data.total),
            rate: parseFloat(churnRate.toFixed(2))
        };
    }
    async calculateOperationalCosts() {
        const result = await executeQuery(`
            SELECT 
                COUNT(*) as total_analyses,
                COALESCE(SUM(credits_charged), 0) as credits_consumed,
                COALESCE(SUM(total_operational_cost_aoa), 0) as operational_cost,
                COALESCE(SUM(revenue_aoa), 0) as revenue,
                COALESCE(SUM(margin_aoa), 0) as margin,
                COALESCE(AVG(margin_aoa), 0) as avg_margin_per_analysis
            FROM analysis_costs
            WHERE created_at > now() - interval '30 days'
        `);
        const data = result.rows[0];
        const revenue = parseFloat(data.revenue || 0);
        const marginPercentage = revenue > 0 ? (parseFloat(data.margin) / revenue) * 100 : 0;
        return {
            credits_sold: 0, // TODO: calcular de transactions
            credits_consumed: parseInt(data.credits_consumed || 0),
            revenue,
            operational_cost: parseFloat(data.operational_cost || 0),
            margin: parseFloat(data.margin || 0),
            margin_percentage: parseFloat(marginPercentage.toFixed(2)),
            total_analyses: parseInt(data.total_analyses || 0),
            avg_margin_per_analysis: parseFloat(data.avg_margin_per_analysis || 0)
        };
    }
    // ==================== PAYMENT APPROVALS ====================
    async getPendingPayments() {
        const result = await executeQuery(`
            SELECT 
                t.*,
                u.name as user_name,
                u.email as user_email,
                c.name as company_name
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            LEFT JOIN companies c ON t.company_id = c.id
            WHERE t.status = 'PENDING_APPROVAL'
            ORDER BY t.created_at DESC
        `);
        return result.rows.map(row => ({
            ...row,
            proof_document: row.proof_document, // Base64
            payment_method: row.payment_method
        }));
    }
    async approvePayment(transactionId, adminId) {
        const txRes = await executeQuery('SELECT * FROM transactions WHERE id = $1', [transactionId]);
        if (txRes.rowCount === 0)
            throw new Error('Transação não encontrada');
        const tx = txRes.rows[0];
        if (tx.status !== 'PENDING_APPROVAL')
            throw new Error('Transação não está pendente');
        let updateQuery = '';
        let updateParams = [];
        // Determine destination: Company or Personal
        if (tx.company_id) {
            updateQuery = 'UPDATE companies SET credits = credits + $1 WHERE id = $2';
            updateParams = [tx.credits, tx.company_id];
        }
        else if (tx.user_id) {
            updateQuery = 'UPDATE users SET credits = credits + $1 WHERE id = $2';
            updateParams = [tx.credits, tx.user_id];
        }
        else {
            throw new Error('Transação sem beneficiário definido (user_id ou company_id ausente)');
        }
        // Execute credits update
        await executeQuery(updateQuery, updateParams);
        // Update Transaction record
        await executeQuery(`UPDATE transactions 
             SET status = 'COMPLETED', 
                 updated_at = CURRENT_TIMESTAMP, 
                 approved_by = $1,
                 approved_at = CURRENT_TIMESTAMP,
                 admin_notes = $2
             WHERE id = $3`, [adminId, 'Aprovado via Backoffice', transactionId]);
        return { success: true };
    }
    async rejectPayment(transactionId, reason, adminId) {
        try {
            await executeQuery(`UPDATE transactions 
                 SET status = 'REJECTED', 
                     updated_at = CURRENT_TIMESTAMP, 
                     admin_notes = $1,
                     notes = $2
                 WHERE id = $3`, [`Rejeitado por ADM:${adminId}`, reason, transactionId]);
            return { success: true };
        }
        catch (error) {
            console.error('Error in rejectPayment:', error);
            throw error;
        }
    }
}
