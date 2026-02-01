
import { executeQuery, executeTransaction } from '../database/postgres.client.js';
import { n8nService } from './n8n.service.js';

export interface ServerSubscription {
    id: string;
    company_id: string;
    server_type: 'BASIC' | 'STANDARD' | 'PRO' | 'DEDICATED';
    monthly_cost: number;
    status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
    started_at: Date;
    expires_at: Date;
}

// Hardcoded costs are deprecated, now using 'server_performance_plans' table.

export class ServerSubscriptionService {

    async getSubscription(companyId: string): Promise<ServerSubscription | null> {
        const res = await executeQuery(
            `SELECT * FROM server_subscriptions 
             WHERE company_id = $1 AND status IN ('ACTIVE', 'SUSPENDED') 
             ORDER BY created_at DESC LIMIT 1`,
            [companyId]
        );
        return res.rows[0] || null;
    }

    async getPlans() {
        const result = await executeQuery(
            `SELECT * FROM server_performance_plans 
             WHERE is_visible = true 
             ORDER BY monthly_credits ASC`
        );
        return result.rows.map(p => ({
            ...p,
            features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features,
            icon: p.icon || 'Server',
            analysis_cost: parseFloat(p.analysis_cost || 0)
        }));
    }

    async getCurrentAnalysisCost(companyId: string): Promise<number> {
        if (!companyId) return 1; // Fallback

        try {
            const res = await executeQuery(
                `SELECT p.analysis_cost 
                 FROM server_subscriptions s
                 JOIN server_performance_plans p ON s.server_type = p.slug
                 WHERE s.company_id = $1 AND s.status = 'ACTIVE'
                 ORDER BY s.created_at DESC LIMIT 1`,
                [companyId]
            );

            if (res.rowCount && res.rows[0]) {
                return parseFloat(res.rows[0].analysis_cost || 0);
            }
        } catch (e) {
            console.warn(`[getCurrentAnalysisCost] Error fetching cost for company ${companyId}:`, e);
        }

        return 1; // Default fallback if no active subscription or error
    }

    async consumeAnalysisCredits(companyId: string, userId: string, docId: string, client?: any): Promise<number> {
        if (!companyId) return 0;

        const query = client ? (text: string, params: any[]) => client.query(text, params) : executeQuery;

        // 1. Fetch user role to determine billing target
        const userRes = await query('SELECT role FROM users WHERE id = $1', [userId]);
        const userRole = (userRes.rows[0]?.role || '').toUpperCase();
        console.log(`[BILLING DEBUG] User ${userId} has role: ${userRole}`);

        // 2. Fetch dynamic cost based on active plan
        const costRes = await query(
            `SELECT p.analysis_cost FROM server_subscriptions s
             JOIN server_performance_plans p ON s.server_type = p.slug
             WHERE s.company_id = $1 AND s.status = 'ACTIVE' 
             ORDER BY s.created_at DESC LIMIT 1`,
            [companyId]
        );
        const cost = costRes.rows[0]?.analysis_cost !== undefined ? parseFloat(costRes.rows[0].analysis_cost) : 1.00;
        console.log(`[BILLING DEBUG] Analysis cost for company ${companyId}: ${cost}`);

        // 3. Role-based billing: COLLABORATOR uses personal wallet, others use company balance
        if (userRole === 'COLLABORATOR') {
            console.log(`[BILLING DEBUG] COLLABORATOR detected - charging personal wallet`);
            // Deduct from user's personal wallet
            const updateUserRes = await query(
                'UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING name',
                [cost, userId]
            );

            if (updateUserRes.rowCount && updateUserRes.rowCount > 0) {
                console.log(`[CREDIT] Deducted ${cost} credits from collaborator ${userId} personal wallet for doc ${docId}`);

                await query(
                    `INSERT INTO audit_logs (user_id, action, resource_type, target_id, details, company_id) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [userId, 'consume_credit', 'document_analysis', docId, JSON.stringify({ amount: cost, type: 'personal_wallet', role: 'COLLABORATOR' }), companyId]
                );
            } else {
                throw new Error('Créditos pessoais insuficientes. Por favor, recarregue sua carteira.');
            }
        } else {
            console.log(`[BILLING DEBUG] Non-collaborator role (${userRole}) - charging company balance`);
            // Deduct from company balance (ADMIN, OWNER, ACCOUNTANT, etc.)
            const updateCompanyRes = await query(
                'UPDATE companies SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING name',
                [cost, companyId]
            );

            if (updateCompanyRes.rowCount && updateCompanyRes.rowCount > 0) {
                console.log(`[CREDIT] Deducted ${cost} credits from company ${companyId} for doc ${docId}`);

                await query(
                    `INSERT INTO audit_logs (user_id, action, resource_type, target_id, details, company_id) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [userId, 'consume_credit', 'document_analysis', docId, JSON.stringify({ amount: cost, type: 'company_balance', role: userRole }), companyId]
                );
            } else {
                throw new Error('Saldo da empresa insuficiente. Por favor, recarregue a conta da empresa.');
            }
        }

        return cost;
    }

    async activateSubscription(companyId: string, serverType: string, userId: string) {
        // Fetch plan details from the database
        const planRes = await executeQuery('SELECT * FROM server_performance_plans WHERE slug = $1', [serverType.toUpperCase()]);
        if (planRes.rowCount === 0) throw new Error('Invalid Server Type');

        const plan = planRes.rows[0];
        const cost = plan.monthly_credits;

        const result = await executeTransaction(async (client) => {
            // 1. Check Verification and Credits
            const companyRes = await client.query('SELECT credits, is_verified FROM companies WHERE id = $1', [companyId]);
            if (companyRes.rowCount === 0) throw new Error('Company not found');

            const { credits: currentCredits, is_verified: isVerified } = companyRes.rows[0];

            if (!isVerified) {
                throw new Error('A ativação de servidores requer uma empresa verificada.');
            }

            // 2. Identify previous ACTIVE subscription for workflow cleanup
            const prevSubRes = await client.query(
                `SELECT s.workflow_id, s.n8n_url, p.n8n_api_key 
                 FROM server_subscriptions s
                 JOIN server_performance_plans p ON s.server_type = p.slug
                 WHERE s.company_id = $1 AND s.status IN ('ACTIVE', 'SUSPENDED')
                 ORDER BY s.created_at DESC LIMIT 1`,
                [companyId]
            );

            const oldWorkflow = prevSubRes.rows[0];

            // 3. Cancel previous ACTIVE subscription
            await client.query(
                `UPDATE server_subscriptions SET status = 'CANCELLED', updated_at = NOW() 
                 WHERE company_id = $1 AND status IN ('ACTIVE', 'SUSPENDED')`,
                [companyId]
            );

            // 3. Verify Balance
            if (currentCredits < cost) {
                throw new Error(`Créditos insuficientes. Necessário: ${cost}, Disponível: ${currentCredits}`);
            }

            // 4. Deduct Credits (Subscription Cost)
            await client.query(
                `UPDATE companies SET credits = credits - $1 WHERE id = $2`,
                [cost, companyId]
            );

            // 5. Award Welcome Credits (If any)
            if (plan.welcome_credits > 0) {
                await client.query(
                    `UPDATE companies SET credits = credits + $1 WHERE id = $2`,
                    [plan.welcome_credits, companyId]
                );
            }

            // 6. Create Subscription (30 Days)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            const insertRes = await client.query(
                `INSERT INTO server_subscriptions (company_id, server_type, monthly_cost, status, expires_at)
                 VALUES ($1, $2, $3, 'ACTIVE', $4)
                 RETURNING *`,
                [companyId, serverType, cost, expiresAt]
            );

            // 7. Log Transaction: Subscription DEBIT
            await client.query(
                `INSERT INTO transactions (user_id, company_id, type, amount, credits, description, status)
                 VALUES ($1, $2, 'DEBIT', 0, $3, $4, 'COMPLETED')`,
                [userId, companyId, -cost, `Assinatura Servidor ${serverType}`]
            );

            // 8. Log Transaction: Welcome Credits BONUS
            if (plan.welcome_credits > 0) {
                await client.query(
                    `INSERT INTO transactions (user_id, company_id, type, amount, credits, description, status)
                     VALUES ($1, $2, 'BONUS', 0, $3, $4, 'COMPLETED')`,
                    [userId, companyId, plan.welcome_credits, `Bónus Inicial: Servidor ${serverType}`]
                );
            }

            const newSubscription = insertRes.rows[0];
            return { newSubscription, oldWorkflow };
        });

        const { newSubscription, oldWorkflow } = result;

        // 9. Post-Transaction: Delete OLD Workflow if exists
        if (oldWorkflow && oldWorkflow.workflow_id) {
            try {
                await n8nService.deleteWorkflow(oldWorkflow.workflow_id, oldWorkflow.n8n_url, oldWorkflow.n8n_api_key);
            } catch (err) {
                console.warn(`[Cleanup] Failed to delete old workflow ${oldWorkflow.workflow_id}:`, err);
            }
        }

        // 7. Post-Transaction: Provision N8N Workflow (Async or Await based on requirement)
        // We await it to ensure the user gets a fully provisioned system or error.
        try {
            // Fetch company name for the workflow name
            const compRes = await executeQuery('SELECT name FROM companies WHERE id = $1', [companyId]);
            const companyName = compRes.rows[0]?.name || 'Unknown';

            const n8nDetails = await n8nService.provisionWorkflow(companyName, {
                n8n_base_url: plan.n8n_base_url,
                n8n_api_key: plan.n8n_api_key,
                n8n_template_id: plan.n8n_template_id,
                plan_name: plan.name
            });

            // Update Subscription with N8N Details
            await executeQuery(
                `UPDATE server_subscriptions 
                 SET n8n_url = $1, workflow_id = $2, webhook_url = $3 
                 WHERE id = $4`,
                [n8nDetails.n8nUrl, n8nDetails.workflowId, n8nDetails.webhookUrl, newSubscription.id]
            );

            console.log(`[Provisioning] Updated subscription ${newSubscription.id} with N8N details.`);

            // Return updated object
            return { ...newSubscription, ...n8nDetails };

        } catch (provErr: any) {
            console.error('❌ [CRITICAL] N8N Provisioning failed:', provErr.message);
            // Optionally: Throw here to stop the activation if N8N is non-negotiable
            throw new Error(`Servidor ativado no banco, mas falhou ao provisionar workflow: ${provErr.message}`);
        }
    }

    async getCompanyWebhook(companyId: string): Promise<string> {
        if (!companyId) return "https://n8n.conversio.ao/webhook-test/document-analysis";

        try {
            const subRes = await executeQuery(
                `SELECT webhook_url FROM server_subscriptions 
                 WHERE company_id = $1 AND status = 'ACTIVE' 
                 ORDER BY created_at DESC LIMIT 1`,
                [companyId]
            );

            if (subRes.rowCount && subRes.rowCount > 0 && subRes.rows[0].webhook_url) {
                return subRes.rows[0].webhook_url;
            }
        } catch (e) {
            console.warn(`[getCompanyWebhook] Failed to fetch custom webhook for ${companyId}, using default.`, e);
        }

        return "https://n8n.conversio.ao/webhook-test/document-analysis";
    }

    async processRenewals() {
        // Find subscriptions expiring in the next 24h or already expired but still ACTIVE
        // Ideally run this daily
        const expiringRes = await executeQuery(
            `SELECT * FROM server_subscriptions 
             WHERE status = 'ACTIVE' AND expires_at <= NOW()`
        );

        const results = { renewed: 0, suspended: 0, errors: 0 };

        for (const sub of expiringRes.rows) {
            try {
                await executeTransaction(async (client) => {
                    const companyRes = await client.query('SELECT credits FROM companies WHERE id = $1', [sub.company_id]);
                    const credits = companyRes.rows[0]?.credits || 0;

                    if (credits >= sub.monthly_cost) {
                        // RENEW
                        await client.query(
                            `UPDATE companies SET credits = credits - $1 WHERE id = $2`,
                            [sub.monthly_cost, sub.company_id]
                        );

                        // Update Expiry +30 days
                        const newExpiry = new Date(sub.expires_at);
                        newExpiry.setDate(newExpiry.getDate() + 30);

                        await client.query(
                            `UPDATE server_subscriptions SET expires_at = $1, updated_at = NOW() WHERE id = $2`,
                            [newExpiry, sub.id]
                        );

                        await client.query(
                            `INSERT INTO transactions (company_id, type, credits, description, status)
                             VALUES ($1, 'DEBIT', $2, $3, 'COMPLETED')`,
                            [sub.company_id, -sub.monthly_cost, `Renovação Automática Servidor ${sub.server_type}`]
                        );
                        results.renewed++;
                    } else {
                        // SUSPEND
                        await client.query(
                            `UPDATE server_subscriptions SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`,
                            [sub.id]
                        );
                        results.suspended++;
                    }
                });
            } catch (e) {
                console.error(`Error processing renewal for sub ${sub.id}`, e);
                results.errors++;
            }
        }
        return results;
    }
}
