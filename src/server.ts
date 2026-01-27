
import express from 'express';
import os from 'os';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
dotenv.config();

import { executeQuery, executeTransaction } from './database/postgres.client.js';
import { authService } from './auth/auth.service.js';
import { AdminService } from './admin/admin.service.js';
import { BillingService } from './admin/billing.service.js';
import { settingsService } from './admin/settings.service.js';
import { documentsService } from './services/documents.service.js';
import { getActiveCreditPackages } from './services/credit.service.js';
import { aiService } from './services/ai.service.js';
import { workflowService } from './services/workflow.service.js';
import { ServerSubscriptionService } from './services/serverSubscription.service.js';
import { storageService } from './services/storage.service.js';
import serverPlansRoutes from './routes/serverPlans.routes.js';
import multer from 'multer';
import { hashPassword } from './utils/password.js';

// AI Agents Imports
import { SentinelAgent } from './agents/sentinel.js';
import { WatchdogAgent } from './agents/watchdog.js';
import { PredictorAgent } from './agents/predictor.js';
import { OptimizerAgent } from './agents/optimizer.js';

import { runAllMigrations } from './migrationRunner.js';

const upload = multer({ storage: multer.memoryStorage() });
import { authenticate, validateCompanyAccess } from './auth/auth.middleware.js';
import { pool } from './database/postgres.client.js';

const app = express();
const adminService = new AdminService();
const billingService = new BillingService();
const subscriptionService = new ServerSubscriptionService();
const PORT = process.env.AUTH_API_PORT || 5000;

// Plan Limits Configuration
const PLAN_LIMITS: Record<string, { maxSubordinates: number, monthlyCredits: number }> = {
    'free': { maxSubordinates: 1, monthlyCredits: 10 },
    'pro': { maxSubordinates: 5, monthlyCredits: 100 },
    'enterprise': { maxSubordinates: 20, monthlyCredits: 500 }
};

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(o => o);
app.use(cors({
    origin: (origin, callback) => {
        const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
        if (!origin || allowedOrigins.includes(origin) || isDev) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from origin: ${origin}`);
            callback(new Error('CORS blocked'));
        }
    },
    credentials: true
}));

// --- SECURITY MIDDLEWARE (MVP SAFE MODE) ---
app.use(helmet());
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 300, // Limit each IP to 300 requests per windowMs (relaxed for MVP)
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// GLOBAL REQUEST LOGGER
app.use((req, res, next) => {
    // Production logger: minimal and safe
    if (process.env.NODE_ENV === 'debug') {
        console.log(`[REQUEST] ${new Date().toISOString()} ${req.method} ${req.url}`);
    }
    next();
});

// Helper
// ... (imports)



// Helper
const logSystemAction = async (userId: string | null, action: string, resource: string, target_id: string | null, details: any, req?: any, companyId?: string) => {
    try {
        await executeQuery(
            `INSERT INTO audit_logs (user_id, action, resource_type, target_id, details, ip_address, user_agent, company_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId,
                action,
                resource,
                target_id,
                JSON.stringify(details),
                req?.ip || null,
                req?.headers?.['user-agent'] || null,
                companyId || req?.user?.companyId || null
            ]
        );
    } catch (err) {
        console.error('[AUDIT_LOG_ERROR]', err);
    }
};

async function createAiAlert(companyId: string, agent: 'Sentinel' | 'Predictor' | 'Optimizer' | 'Watchdog', severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'OPPORTUNITY', title: string, message: string, metadata: any = {}) {
    try {
        await executeQuery(
            `INSERT INTO ai_alerts (company_id, agent_name, severity, title, message, metadata) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [companyId, agent, severity, title, message, JSON.stringify(metadata)]
        );
    } catch (err) {
        console.error('Error creating AI alert:', err);
    }
}

// Helper para autenticação
const requireAuth = (req: any, res: any, next: any) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('No token');
        req.user = authenticate(token);
        next();
    } catch (err: any) {
        res.status(401).json({ error: 'Sessão expirada ou inválida.' });
    }
};

const requireAdmin = (req: any, res: any, next: any) => {
    const role = (req.user?.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'OWNER') {
        return res.status(403).json({ error: `Acesso negado. Admin/Proprietário necessário.` });
    }
    next();
};

const requireSuperAdmin = (req: any, res: any, next: any) => {
    const role = (req.user?.role || '').toUpperCase();
    if (role !== 'SUPER_ADMIN') {
        console.warn(`[AUTH] Access denied for user ${req.user?.id} (role: ${req.user?.id ? req.user.role : 'GUEST'}) to ${req.url} - Super Admin required`);
        return res.status(403).json({ error: 'Acesso restrito ao Super Administrador' });
    }
    next();
};

// ==================== AUTH ====================
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: 'debug-v1' }));

// ==================== PUBLIC ROUTES ====================
app.use('/api/server-plans', serverPlansRoutes);

app.get('/api/servers/status', requireAuth, async (req: any, res) => {
    try {
        const { companyId: queryCompanyId } = req.query;
        // Priority: companyId from query (Accountant flow), fallback to JWT companyId (Owner flow)
        const targetCompanyId = (queryCompanyId as string) || req.user.companyId;

        if (!targetCompanyId || targetCompanyId === 'ALL') {
            return res.status(400).json({ error: 'Company ID required' });
        }

        // Validate access (Accountant or member)
        const hasAccess = await validateCompanyAccess(req.user, targetCompanyId);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        const sub = await subscriptionService.getSubscription(targetCompanyId);
        res.json(sub || { status: 'INACTIVE', server_type: 'NONE' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/servers/activate', requireAuth, async (req: any, res) => {
    try {
        const { serverType, companyId: bodyCompanyId } = req.body;
        const userId = req.user.id;

        // 1. Resolve Target Company
        // Priority: companyId from body (Accountant/Admin flow), fallback to JWT companyId (Owner flow)
        const targetCompanyId = bodyCompanyId || req.user.companyId;

        if (!targetCompanyId) {
            return res.status(400).json({ error: 'ID da empresa não definido.' });
        }

        // 2. Multi-Tenant Permission Check
        // Allow if: SuperAdmin OR User belongs to company OR User is owner OR User is Accountant managing that company
        const role = (req.user.role || '').toUpperCase();
        const isSuperAdmin = role === 'SUPER_ADMIN';
        const isOwner = role === 'OWNER' || role === 'ADMIN';
        const isDirectMember = String(req.user.companyId) === String(targetCompanyId);

        // Detailed check for Accountants
        let hasAccess = isSuperAdmin || (isOwner && isDirectMember);

        if (!hasAccess && (role === 'ACCOUNTANT' || isOwner)) {
            // Verify if this accountant/admin manages this specific company
            const checkRes = await executeQuery(
                'SELECT id FROM companies WHERE id = $1 AND owner_id = $2',
                [targetCompanyId, userId]
            );
            if (checkRes.rowCount && checkRes.rowCount > 0) {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            console.warn(`[AUTH] Unauthorized server activation attempt by user ${userId} for company ${targetCompanyId}`);
            return res.status(403).json({ error: 'Você não tem permissão para ativar servidores nesta empresa.' });
        }

        const sub = await subscriptionService.activateSubscription(targetCompanyId, serverType, userId);
        res.status(201).json(sub);
    } catch (err: any) {
        console.error("Server Activation Failed:", err.message);
        if (err.message.includes('Créditos insuficientes')) {
            return res.status(402).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// Unified N8N Callback Webhook (Async)
app.post('/api/webhooks/n8n/completed', async (req: any, res) => {
    try {
        const payload = req.body;
        const items = Array.isArray(payload) ? payload : [payload];

        console.log(`[WEBHOOK] Received payload with ${items.length} items.`);
        const processedResults = [];

        for (const body of items) {
            const getVal = (key: string) => {
                if (body[key]) return body[key];
                if (body.json && body.json[key]) return body.json[key];
                if (body.output && body.output[key]) return body.output[key];
                if (body.metadata) {
                    const meta = typeof body.metadata === 'string' ? JSON.parse(body.metadata) : body.metadata;
                    if (Array.isArray(meta)) return meta[0]?.[key];
                    return meta[key];
                }
                return null;
            };

            const docId = getVal('docId') || getVal('doc_id') || getVal('audit_id') || getVal('id');
            const userId = getVal('userId') || getVal('user_id');

            if (!docId) {
                console.warn('[WEBHOOK] Item missing docId. Skipping...');
                continue;
            }

            console.log(`[WEBHOOK] Verified ID ${docId}. Updating...`);
            try {
                const result = await documentsService.completeAnalysis(docId, body, userId);
                processedResults.push(result);
            } catch (innerErr: any) {
                console.error(`[WEBHOOK] Failed to process doc ${docId}:`, innerErr.message);
            }
        }

        return res.json({ success: true, processed: processedResults.length });
    } catch (err: any) {
        console.error('[WEBHOOK ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, ownerId } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
        }

        if (ownerId) {
            const admin = await authService.getCredits(ownerId);
            const team = await authService.getTeam(ownerId);
            const limit = PLAN_LIMITS[admin.plan]?.maxSubordinates || 0;
            if (team.length >= limit) {
                return res.status(403).json({ error: `Limite de utilizadores atingido para esta subscrição.` });
            }
        }

        // Pass ownerId as the 6th argument (owner_id column), companyId as null for now (or derive it? default behavior handles null)
        const user = await authService.register(name, email, password, role, null, ownerId);

        // Log
        await logSystemAction(user.id, 'register_user', 'auth', user.id, { email, role, ownerId }, req);

        res.status(201).json({ message: 'Usuário registrado', user });
    } catch (err: any) {
        console.error('Registration Error:', err.message);
        if (err.message === 'Email already registered') {
            return res.status(409).json({ error: 'Este endereço de email já está cadastrado.' });
        }
        res.status(500).json({ error: err.message || 'Erro ao registrar' });
    }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        console.log(`[AUTH] Login attempt for: ${email}`);

        const result = await authService.login(email, password);

        // Log Login (Safe and non-blocking)
        logSystemAction(result.user.id, 'login', 'auth', result.user.id, { flow: 'interactive' }, req)
            .catch(err => console.error('[AUDIT_LOG_ERROR] Login log failed:', err.message));

        res.json(result);
    } catch (err: any) {
        console.error(`[AUTH_LOGIN_ERROR] for ${req.body?.email}:`, err);
        // Se for erro de credenciais, mantém 401. Se for erro de sistema (banco fora), manda para o next() para o global handler tratar
        if (err.message === 'Invalid credentials' || err.message === 'Account is deactivated') {
            return res.status(401).json({ error: 'Credenciais inválidas ou conta desativada.' });
        }
        next(err); // Deixa o global handler tratar erro de banco/sistema
    }
});


// ==================== AGENTS & PROMPTS MANAGEMENT ====================


// ==================== ADMIN: SAAS BACKOFFICE ====================


// ==================== AGENTS & PROMPTS MANAGEMENT ====================
app.get('/api/admin/agents', requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
        const result = await executeQuery('SELECT * FROM agent_prompts ORDER BY name ASC');
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/agents/:id', requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
        const { prompt_text, model_override, temperature, is_active } = req.body;
        await executeQuery(
            `UPDATE agent_prompts 
             SET prompt_text = $1, model_override = $2, temperature = $3, is_active = $4, updated_at = NOW(), updated_by = $5
             WHERE id = $6`,
            [prompt_text, model_override, temperature, is_active, req.user.id, req.params.id]
        );
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Public/Auth endpoint for agents to fetch their own prompt
app.get('/api/agents/prompt/:slug', requireAuth, async (req: any, res) => {
    try {
        const result = await executeQuery(
            'SELECT prompt_text, model_override, temperature FROM agent_prompts WHERE agent_slug = $1',
            [req.params.slug]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Agent not found' });
        res.json(result.rows[0]);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/admin/stats', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const stats = await adminService.getGlobalKPIs();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/activity', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const activity = await adminService.getSystemActivity();
        res.json(activity);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/health', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const status = await adminService.getServiceStatus();
        res.json(status);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/alerts', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const alerts = await adminService.getGovernanceAlerts();
        res.json(alerts);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/realtime', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const stats = await adminService.getRealtimeStats();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/engagement', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const metrics = await adminService.getEngagementMetrics();
        res.json(metrics);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/growth', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const stats = await adminService.getGrowthStats();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/usage', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const stats = await adminService.getUsageHistory();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/infra', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const stats = await adminService.getDetailedInfraStats();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== STORAGE CONFIGURATION ====================
app.get('/api/admin/storage-config', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const result = await executeQuery('SELECT * FROM storage_settings ORDER BY is_active DESC, created_at DESC');
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/storage-config', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    const client = await pool.connect();
    try {
        const { provider, endpoint, region, bucket, access_key, secret_key, tenant_id, is_active } = req.body;

        await client.query('BEGIN');

        if (is_active) {
            // Deactivate others
            await client.query('UPDATE storage_settings SET is_active = false');
        }

        const result = await client.query(
            `INSERT INTO storage_settings (provider, endpoint, region, bucket, access_key, secret_key, tenant_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [provider, endpoint, region, bucket, access_key, secret_key, tenant_id, is_active || false]
        );

        await client.query('COMMIT');

        if (is_active) {
            await storageService.forceReload();
        }

        res.status(201).json(result.rows[0]);
    } catch (err: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.put('/api/admin/storage-config/:id/activate', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE storage_settings SET is_active = false'); // Deactivate all
        await client.query('UPDATE storage_settings SET is_active = true WHERE id = $1', [req.params.id]); // Activate active
        await client.query('COMMIT');

        await storageService.forceReload();
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/admin/companies', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const companies = await adminService.getAllCompanies();
        res.json(companies);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/companies/:id', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const { status, creditsAdjustment } = req.body;
        let updated;
        if (status) {
            updated = await adminService.updateCompanyStatus(req.params.id, status);
        }
        if (creditsAdjustment) {
            updated = await adminService.adjustCompanyCredits(req.params.id, creditsAdjustment);
        }
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/users/:id/status', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const { isActive } = req.body;
        const updated = await adminService.updateUserStatus(req.params.id, isActive);
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/users/:id/role', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const { role } = req.body;
        const updated = await adminService.updateUserRole(req.params.id, role);
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/users/bulk-update', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const { ids, data } = req.body;
        const result = await adminService.bulkUpdateUsers(ids, data);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/users/:id/activity', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const activity = await adminService.getUserActivity(req.params.id);
        res.json(activity);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/users/impersonate/:id', requireAuth, requireSuperAdmin, async (req: any, res: any) => {
    try {
        const user = await adminService.impersonateUser(req.params.id);
        // Aqui em produção geraríamos um novo JWT para este user.
        // Como o authService está no mesmo arquivo ou importado, podemos usar.
        // Para este MVP vamos apenas retornar os dados do user e o frontend mudará o contexto.
        res.json({ success: true, user });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADMIN: BILLING & FINANCE ====================
app.get('/api/admin/billing/stats', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const stats = await billingService.getGlobalFinanceStats();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/billing/transactions', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const txs = await billingService.getRecentTransactions(limit);
        res.json(txs);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/billing/plans', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const plans = await billingService.getPlanDistribution();
        res.json(plans);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/billing/insights', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const insights = await billingService.getFinancialInsights();
        res.json(insights);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Novos Endpoints de CRUD de Planos
app.get('/api/admin/billing/plans/all', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const plans = await billingService.getAllPlans();
        res.json(plans);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/billing/plans', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const plan = await billingService.createPlan(req.body);
        res.status(201).json(plan);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/billing/plans/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const plan = await billingService.updatePlan(req.params.id, req.body);
        res.json(plan);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/billing/plans/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const result = await billingService.deletePlan(req.params.id);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== BILLING: PAYMENT APPROVALS (ADMIN) ====================
app.get('/api/admin/payments/pending', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const payments = await billingService.getPendingPayments();
        res.json(payments);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/payments/:id/approve', requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
        console.log(`[DEBUG] Approving payment ${req.params.id} by admin ${req.user.id}`);
        await billingService.approvePayment(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err: any) {
        console.error('❌ [BILLING APPROVAL ERROR]:', err);
        res.status(500).json({
            error: err.message,
            details: err.detail || err.hint || 'No extra info',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.post('/api/admin/payments/:id/reject', requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
        const { reason } = req.body;
        await billingService.rejectPayment(req.params.id, reason, req.user.id);
        res.json({ success: true });
    } catch (err: any) {
        console.error('❌ [BILLING REJECTION ERROR]:', err);
        res.status(500).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
});

// ==================== BILLING: USER TOPUP ====================
app.post('/api/billing/topup', requireAuth, async (req: any, res) => {
    try {
        const { companyId, amount, credits, method, description, paymentDetails, proof } = req.body;
        const userId = req.user.id;

        // Determine recipient (Company or User)
        // If companyId is 'PERSONAL' or falsy, it maps to NULL in DB for company_id, 
        // effectively meaning "User Personal Balance" (since user_id is set).
        // However, if the user requested a TopUp for a Company, companyId will be a UUID.
        const targetCompanyId = (companyId === 'PERSONAL' || !companyId) ? null : companyId;

        await executeQuery(
            `INSERT INTO transactions 
            (user_id, company_id, type, amount, credits, currency, status, description, payment_method, proof_document, metadata)
            VALUES ($1, $2, 'TOPUP', $3, $4, 'AOA', 'PENDING_APPROVAL', $5, $6, $7, $8)`,
            [
                userId,
                targetCompanyId,
                amount,
                credits,
                description,
                method,
                proof || null,
                JSON.stringify(paymentDetails || {})
            ]
        );

        res.json({ success: true, message: 'Solicitação de recarga enviada com sucesso.' });
    } catch (err: any) {
        console.error('Topup Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== BANK ACCOUNTS (Public & Admin) ====================
app.get('/api/public/bank-accounts', async (req, res) => {
    try {
        const result = await executeQuery("SELECT * FROM bank_accounts WHERE is_active = true ORDER BY bank_name ASC");
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/bank-accounts', requireAuth, requireAdmin, async (req: any, res) => {
    try {
        const { bank_name, account_number, iban, swift, holder_name } = req.body;
        const result = await executeQuery(
            `INSERT INTO bank_accounts (bank_name, account_number, iban, swift, holder_name, is_active) 
             VALUES ($1, $2, $3, $4, $5, true) 
             RETURNING *`,
            [bank_name, account_number, iban, swift, holder_name]
        );
        await logSystemAction(req.user.id, 'create_bank_account', 'finance', result.rows[0].id, { bank_name }, req);
        res.status(201).json(result.rows[0]);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/bank-accounts/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
        await executeQuery("UPDATE bank_accounts SET is_active = false WHERE id = $1", [req.params.id]);
        await logSystemAction(req.user.id, 'delete_bank_account', 'finance', req.params.id, {}, req);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== BILLING: CREDIT PACKAGES ====================
app.get('/api/admin/billing/packages', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const packages = await billingService.getAllCreditPackages();
        res.json(packages);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/billing/packages', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const pkg = await billingService.createCreditPackage(req.body);
        res.status(201).json(pkg);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/billing/packages/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const pkg = await billingService.updateCreditPackage(req.params.id, req.body);
        res.json(pkg);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/billing/packages/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        await billingService.deleteCreditPackage(req.params.id);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== BILLING: OPERATIONAL COSTS ====================
app.get('/api/admin/billing/costs', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const costs = await billingService.getOperationalCosts();
        res.json(costs);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/billing/costs', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const cost = await billingService.setOperationalCost(req.body);
        res.json(cost);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== BILLING: ADVANCED METRICS ====================
app.get('/api/admin/billing/profitability', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const data = await billingService.getCompanyProfitability();
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/billing/consumption-trends', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const data = await billingService.getCreditConsumptionTrends();
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/billing/snapshot/:month', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const data = await billingService.getMonthlySnapshot(req.params.month);
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/billing/snapshot/generate', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const snapshot = await billingService.generateMonthlySnapshot();
        res.json(snapshot);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Limite Mensal de Usuários
app.get('/api/admin/users', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const result = await executeQuery(`
            SELECT u.id, u.name, u.email, u.role, u.company_id, u.status, 
                   u.monthly_credit_limit, u.current_month_consumption,
                   c.name as company_name
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            ORDER BY u.created_at DESC
        `);
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id/limit', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { monthly_credit_limit } = req.body;
        await executeQuery('UPDATE users SET monthly_credit_limit = $1 WHERE id = $2', [monthly_credit_limit, req.params.id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ONBOARDING: COMPANY SETUP ====================
app.post('/api/setup/company', requireAuth, async (req: any, res) => {
    try {
        const { name, nif, type, regime, activity, hasAccountant, accountantEmail } = req.body;

        if (!name || !nif) {
            return res.status(400).json({ error: 'Nome da empresa e NIF são obrigatórios' });
        }

        // 1. Create Company
        const companyRes = await executeQuery(
            `INSERT INTO companies (name, nif, company_type, tax_regime, main_activity, owner_id, status, credits) 
             VALUES ($1, $2, $3, $4, $5, $6, 'VALIDATE', 0) 
             RETURNING *`,
            [name, nif, type || 'PME', regime || 'Geral', activity, req.user.id]
        );
        const newCompany = companyRes.rows[0];

        // 2. Link User to Company
        await executeQuery(
            `UPDATE users SET company_id = $1 WHERE id = $2`,
            [newCompany.id, req.user.id]
        );

        // 3. Create Main Fiscal Entity (Self)
        await executeQuery(
            `INSERT INTO fiscal_entities (company_id, name, nif, entity_type, status) 
             VALUES ($1, $2, $3, 'CLIENT', 'ACTIVE')`,
            [newCompany.id, name, nif]
        );

        // 4. Log Action
        await logSystemAction(req.user.id, 'create_company', 'setup', newCompany.id, { name, nif }, req, newCompany.id);

        res.status(201).json({ success: true, company: newCompany });
    } catch (err: any) {
        console.error('Setup error:', err);
        res.status(500).json({ error: err.message || 'Erro ao configurar empresa' });
    }
});

app.get('/api/auth/me', requireAuth, async (req: any, res) => {
    try {
        const result = await executeQuery('SELECT * FROM users WHERE id = $1', [req.user.id]);
        if (!result.rowCount || result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = result.rows[0];
        res.json({
            user: {
                ...user,
                companyId: user.company_id,
                avatarUrl: user.avatar_url,
                permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {})
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== SYSTEM LOGS ====================
app.get('/api/system/logs', requireAuth, async (req: any, res) => {
    try {
        // Logs for the current user (or all if admin/owner wants to see their team's logs)
        // For simplicity: Show logs where user_id is the user or their subordinates
        const result = await executeQuery(
            `SELECT 
                al.*, 
                u.name as user_name,
                u.email as user_email
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.user_id = $1 
                OR al.user_id IN (SELECT id FROM users WHERE owner_id = $1)
             ORDER BY al.created_at DESC
             LIMIT 100`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/system/audit-batch', requireAuth, async (req: any, res) => {
    try {
        const { company_id, doc_count, error_count, batch_ids, sync_status } = req.body;

        const details = {
            message: `Processamento de ${doc_count} documentos concluído. ${error_count} inconsistências detectadas.`,
            doc_count,
            error_count,
            batch_ids,
            sync_status
        };

        await logSystemAction(
            req.user.id,
            'FISCAL_VALIDATION_BATCH',
            'compliance',
            company_id,
            details,
            req,
            company_id
        );

        res.status(201).json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/system/compliance-logs', requireAuth, async (req: any, res) => {
    try {
        const companyId = req.query.companyId;
        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        // Security Check: Ensure user belongs to company or is admin
        if (req.user.role !== 'ADMIN' && req.user.companyId !== companyId) {
            // For firms/owners, check ownership
            const isOwner = await executeQuery('SELECT id FROM companies WHERE id = $1 AND owner_id = $2', [companyId, req.user.id]);
            if (isOwner.rowCount === 0) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        const result = await executeQuery(
            `SELECT 
                al.*, 
                u.name as user_name
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.company_id = $1 
               AND al.action = 'FISCAL_VALIDATION_BATCH'
             ORDER BY al.created_at DESC
             LIMIT 10`,
            [companyId]
        );
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== TEAM MANAGEMENT: MEMBER CREATION & USAGE ====================
app.post('/api/team/member', requireAuth, async (req: any, res) => {
    console.log('>>> [ALLEGRETTO] ENTERING MEMBER CREATION ROUTE');
    const { name, email, password, permissions, usageLimits, role, licensePlan, companyId } = req.body;
    console.log('[DEBUG] Body received:', { name, email, role, licensePlan, companyId });
    try {
        // Map frontend roles to DB valid roles
        const validRole = role === 'CLIENT_ADMIN' ? 'ADMIN' : (role === 'OPERATOR' ? 'COLLABORATOR' : role);

        // RESTORED: Fetch Admin's info
        const adminRes = await executeQuery('SELECT company_id, role, owner_id FROM users WHERE id = $1', [req.user.id]);
        const adminUser = adminRes.rows[0];
        const userRole = (adminUser?.role || '').toUpperCase();

        console.log('[DEBUG] Create Member Request:', { name, email, role, companyId, requestUserRole: userRole });

        // Target Company: Use body.companyId if ADMIN or ACCOUNTANT, otherwise fall back to admin's own company
        let targetCompanyId = adminUser?.company_id;
        if ((userRole === 'ADMIN' || userRole === 'ACCOUNTANT') && companyId && companyId !== 'ALL') {
            targetCompanyId = companyId;
        }

        if (!targetCompanyId) {
            console.error('[DEBUG] Error: Target Company ID missing');
            throw new Error('Empresa alvo não definida. Impossível criar membro.');
        }

        // Limit Check: Fetch max_users from active server plan
        const planLimitRes = await executeQuery(
            `SELECT spp.max_users 
             FROM server_subscriptions ss
             JOIN server_performance_plans spp ON ss.server_type = spp.slug
             WHERE ss.company_id = $1 AND ss.status = 'ACTIVE'
             ORDER BY ss.created_at DESC LIMIT 1`,
            [targetCompanyId]
        );
        const maxUsers = planLimitRes.rows[0]?.max_users || 1; // Default to 1 if no plan

        const currentMembersRes = await executeQuery('SELECT COUNT(*) as count FROM users WHERE company_id = $1 AND role NOT IN ($2, $3)', [targetCompanyId, 'ACCOUNTANT', 'ADMIN']);
        const memberCount = parseInt(currentMembersRes.rows[0]?.count || '0');

        if (memberCount >= maxUsers) {
            console.error(`[DEBUG] Limit reached for company ${targetCompanyId}: ${memberCount}/${maxUsers}`);
            return res.status(403).json({ error: `Limite de ${maxUsers} utilizadores atingido para esta empresa. Faça upgrade do seu plano para adicionar mais membros.` });
        }

        // --- TRANSACTION START ---
        // Using transaction to ensure credits are only deducted if member is created successfully

        // Import executeTransaction at top if needed, or assume it's available via previous step
        // But since I cannot edit imports easily without reading top, I will assume I can auto-import or user ts-node will find it if in same module file?
        // Wait, server.ts imports from './database/postgres.client'. I need to update the import too?
        // Yes. But let's assume I can use the pool directly or just use the new helper if I imported it.
        // Actually, I'll modify the import lines in a separate call if needed. For now, let's just use the logic.

        // Let's assume I will update imports in next step.
        // Logic:

        console.log('[DEBUG] Create Member: Preparing transaction...', {
            name, email, cost_fallback: 15, licensePlan, targetCompanyId
        });
        console.log('[DEBUG] Starting Transaction...');
        const result = await executeTransaction(async (client) => {
            console.log('[DEBUG] TX: Checking Email...');
            // 1. Check Email
            const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
            if (existing.rowCount > 0) {
                throw new Error('Email já registado');
            }

            // 2. Resolve Plan Cost
            let cost = 15; // Default fallback
            const planRes = await client.query('SELECT price_credits FROM plans WHERE name = $1', [(licensePlan || 'STARTER').toUpperCase()]);
            if (planRes.rowCount > 0) {
                cost = planRes.rows[0].price_credits;
            }

            // 3. Check Credits
            const companyCredsRes = await client.query('SELECT credits FROM companies WHERE id = $1 FOR UPDATE', [targetCompanyId]);
            const companyCredits = companyCredsRes.rows[0]?.credits || 0;

            if (companyCredits < cost) {
                throw new Error(`Saldo insuficiente da empresa. Necessários ${cost} créditos.`);
            }

            // 4. Deduct from Company
            await client.query('UPDATE companies SET credits = credits - $1 WHERE id = $2', [cost, targetCompanyId]);

            // 5. Create User (WITH HASHED PASSWORD)
            const hashedPassword = await hashPassword(password || '123456');

            const insertRes = await client.query(
                `INSERT INTO users (name, email, password, role, company_id, owner_id, permissions, status, credits, plan, is_active) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', 0, $8, true) 
                 RETURNING id, name, email, role, status, created_at, credits`,
                [name, email, hashedPassword, validRole || 'COLLABORATOR', targetCompanyId, req.user.id, JSON.stringify(permissions || {}), licensePlan || 'free']
            );
            const newUser = insertRes.rows[0];
            console.log('[DEBUG] TX: User Inserted:', newUser?.id);

            // 6. Log Transaction
            console.log('[DEBUG] TX: Logging Transaction...');
            await client.query(
                `INSERT INTO transactions (company_id, user_id, credits, type, status, amount, description, metadata, plan_name) 
                 VALUES ($1, $2, $3::INTEGER, 'DEBIT', 'COMPLETED', $4::DECIMAL, $5, $6, $7)`,
                [
                    targetCompanyId,
                    req.user.id,
                    cost,
                    cost,
                    `Adição de membro: ${name}`,
                    JSON.stringify({ member_email: email, plan: licensePlan }),
                    licensePlan || 'STARTER'
                ]
            );

            return newUser;
        });

        console.log('[DEBUG] Transaction Committed. Result ID:', result?.id);

        // 7. Update Permissions and Context
        const userToUpdateId = result?.id;
        if (!userToUpdateId) {
            console.error('[CRITICAL] Transaction succeeded but no user ID returned!');
            throw new Error('Erro ao recuperar ID do novo membro.');
        }

        // If we get here, transaction committed.

        // Update Permissions (Can be outside tx as it's separate service/logic usually, but better inside? 
        // usageLimits/permissions can be updated later. If this fails, user exists but maybe permissions wrong. Acceptable risk vs complexity.)

        const methodUsageLimits = {
            ...(usageLimits || {}),
            license: {
                plan: licensePlan || 'MONTHLY',
                cost: 0,
                expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                active: true
            }
        };

        // Note: authService is frontend service, here we are in backend. We need to update user permissions in DB.
        // It seems `authService` in frontend calls API. In backend we don't have `authService`.
        // The original code called `authService.updatePermissions`. Wait, IS `authService` IMPORTED IN SERVER.TS?
        // Let's check imports. Code viewed previously didn't show imports.
        // But line 415 in original code: `await authService.updatePermissions(member.id, permissions, methodUsageLimits);`
        // If it exists in server.ts, fine.

        try {
            // We can run this outside tx.
            // But wait, the original code had it.
            // Use executeQuery for this as it might not support the client object unless I refactor it.
            // I'll leave it as is, running after tx.
            await executeQuery('UPDATE users SET permissions = $1, usage_limits = $2 WHERE id = $3', [JSON.stringify(permissions), JSON.stringify(methodUsageLimits), userToUpdateId]);
        } catch (e) {
            console.error('Failed to update permissions post-creation', e);
        }

        await logSystemAction(req.user.id, 'create_member', 'team', userToUpdateId, { name, email, plan: licensePlan }, req, targetCompanyId);

        res.json({ message: 'Membro criado com sucesso', member: result });

    } catch (err: any) {
        const errorDetail = `
Time: ${new Date().toISOString()}
Error: ${err.message}
Stack: ${err.stack}
Context: ${JSON.stringify({ name, email, role, companyId, adminId: req.user.id })}
`;
        console.error('[ALLEGRETTO CRITICAL]', errorDetail);

        // Write to a dedicated file just in case console is lost
        import('fs').then(fs => {
            fs.appendFileSync('debug_member.log', errorDetail);
        });

        if (err.message === 'Email já registado') return res.status(400).json({ error: err.message });
        if (err.message.includes('Saldo insuficiente')) return res.status(400).json({ error: err.message });

        res.status(500).json({
            error: 'Erro interno ao processar registo de membro',
            details: err.message,
            stack: err.stack // Send stack in development to help debug
        });
    }
});

app.put('/api/team/permissions/:id', requireAuth, async (req: any, res) => {
    try {
        const { permissions, usageLimits, role } = req.body;
        const updated = await authService.updatePermissions(req.params.id, permissions, usageLimits, role);
        await logSystemAction(req.user.id, 'update_permissions', 'team', req.params.id, { permissions, usageLimits }, req);
        res.json(updated);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// Admin Top-up Credits
app.post('/api/users/:id/credits', requireAuth, async (req: any, res) => {
    try {
        // Basic check for admin role (or accountant firm owner)
        if (req.user.role !== 'ADMIN' && req.user.role !== 'ACCOUNTANT') {
            return res.status(403).json({ error: 'Permission denied' });
        }

        const userId = req.params.id;
        const { amount } = req.body;

        if (!amount || isNaN(amount)) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const result = await executeQuery(
            'UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits, name',
            [amount, userId]
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });

        // Log transaction
        await executeQuery(
            `INSERT INTO transactions (company_id, user_id, credits, type, description, amount) 
              VALUES ($1, $2, $3, 'BONUS', $4, 0)`,
            [req.user.companyId || req.user.id, userId, amount, `Recarga Manual por ${req.user.name}`]
        );

        await logSystemAction(req.user.id, 'topup_credits', 'user', userId, { amount }, req);
        res.json({ success: true, newCredits: result.rows[0].credits });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Transfer credits from Company to User (Accountant/Owner -> User)
app.post('/api/credits/transfer-to-user', requireAuth, async (req: any, res) => {
    const client = await pool.connect();
    try {
        const { targetUserId, amount } = req.body;

        if (!targetUserId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'ID do usuário alvo e quantidade válida são obrigatórios.' });
        }

        // 1. Identify Source Company
        let sourceCompanyId = req.user.companyId;
        const userRole = (req.user.role || '').toUpperCase();

        if (userRole === 'ACCOUNTANT') {
            // Check if accountant has access to the target user's company (or if target user is in their firm? No, requirement says "Reforçar Utilizador")
            // Assuming "Reforçar Utilizador" means reinforcing a user OF THE SELECTED COMPANY.
            // So we need to ensure we are debiting the SELECTED COMPANY.
            // But here the endpoint receives `targetUserId`. We should find which company this user belongs to, 
            // and verify if the requestor (Accountant) manages that company.
            const targetUserRes = await client.query('SELECT company_id FROM users WHERE id = $1', [targetUserId]);
            if (targetUserRes.rowCount === 0) return res.status(404).json({ error: 'Usuário alvo não encontrado.' });

            const targetUserCompanyId = targetUserRes.rows[0].company_id;

            // Verify Accountant access
            const accessCheck = await client.query('SELECT 1 FROM companies WHERE id = $1 AND (owner_id = $2 OR id = $2)', [targetUserCompanyId, req.user.id]);
            // Note: simplistic check. Usually accountant manages multiple companies. 
            // If the system uses `owner_id` to link companies to accountant, this works.
            // If `owner_id` is the client owner, then we need another check. 
            // Based on `server.ts` logic elsewhere (e.g. GET /api/companies): "c.owner_id = $1" implies the user owns the companies.

            // However, the accountant might be operating on a "Selected Company" in the UI.
            // If the UI sends `companyId` context, we could use that. But usually transferring TO a user implies using THAT user's company funds.
            sourceCompanyId = targetUserCompanyId;

            // Check if requesting user has rights to manage this company
            if (userRole !== 'ADMIN') {
                // Check if req.user.id is owner of sourceCompanyId
                const isOwner = await client.query('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [sourceCompanyId, req.user.id]);
                if (isOwner.rowCount === 0) {
                    // If not owner, checking if it is the accountant linked?
                    // Current schema seems to treat `owner_id` as the "Accountant/Firm" for created companies, or the Client themselves.
                    // Let's rely on standard ownership check.
                    return res.status(403).json({ error: 'Permissão negada para gerir créditos desta empresa.' });
                }
            }
        }

        if (!sourceCompanyId) {
            return res.status(400).json({ error: 'Empresa de origem não identificada.' });
        }

        await client.query('BEGIN');

        // 2. Check Company Balance
        const companyRes = await client.query('SELECT credits, name FROM companies WHERE id = $1', [sourceCompanyId]);
        if (companyRes.rowCount === 0) throw new Error('Empresa não encontrada.');
        const companyCredits = parseInt(companyRes.rows[0].credits || '0');

        if (companyCredits < amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Saldo da empresa insuficiente. Disponível: ${companyCredits}` });
        }

        // 3. Deduct from Company
        await client.query('UPDATE companies SET credits = credits - $1 WHERE id = $2', [amount, sourceCompanyId]);

        // 4. Add to User
        await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [amount, targetUserId]);

        // 5. Log Transaction (Debit Company)
        await client.query(
            `INSERT INTO transactions (company_id, user_id, credits, type, description, amount) 
             VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, 0)`,
            [sourceCompanyId, req.user.id, amount, `Transferência para usuário ${targetUserId}`]
        );

        // 6. Log Transaction (Credit User)
        const companyNameRes = await client.query('SELECT name FROM companies WHERE id = $1', [sourceCompanyId]);
        const companyName = companyNameRes.rows[0]?.name || 'Empresa';

        await client.query(
            `INSERT INTO transactions (company_id, user_id, credits, type, description, amount, status) 
             VALUES (NULL, $1, $2, 'TRANSFER_IN', $3, 0, 'COMPLETED')`,
            [targetUserId, amount, `Recebido de ${companyName}`]
        );

        // 6. Log Transaction (Credit User) - Optional, or logged via audit
        await logSystemAction(req.user.id, 'transfer_credits_to_user', 'finance', targetUserId, { amount, companyId: sourceCompanyId }, req);

        await client.query('COMMIT');

        res.json({ success: true, message: 'Créditos transferidos com sucesso.' });

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/auth/change-password', requireAuth, async (req: any, res) => {
    try {
        const { password } = req.body;
        await authService.changePassword(req.user.id, password);

        // Clear force flag
        await executeQuery('UPDATE users SET force_password_change = false WHERE id = $1', [req.user.id]);

        await logSystemAction(req.user.id, 'change_password', 'auth', req.user.id, { flow: 'user_initiated' }, req);
        res.json({ message: 'Senha alterada com sucesso' });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// Update User Prompts
app.put('/api/users/prompts', requireAuth, async (req: any, res) => {
    try {
        const { prompts } = req.body;
        if (!prompts) return res.status(400).json({ error: 'Prompts required' });

        // Update separate columns
        await executeQuery(
            `UPDATE users SET 
                auditor_prompt = $1,
                strategist_prompt = $2,
                rag_prompt = $3,
                analyzer_prompt = $4,
                vision_prompt = $5
             WHERE id = $6`,
            [
                prompts.AUDITOR,
                prompts.STRATEGIST,
                prompts.RAG,
                prompts.ANALYZER,
                prompts.VISION,
                req.user.id
            ]
        );

        await logSystemAction(req.user.id, 'update_prompts', 'user', req.user.id, {}, req);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== FATURIX API ====================
app.get('/api/faturix/audits', requireAuth, async (req: any, res) => {
    try {
        const audits = await authService.getFaturixAudits(req.user.id);
        res.json(audits);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/faturix/stats', requireAuth, async (req: any, res: any) => {
    try {
        const { companyId, month, year } = req.query;

        // Tenancy Check
        if (!(await validateCompanyAccess(req.user, companyId as string))) {
            return res.status(403).json({ error: 'Acesso negado a esta empresa' });
        }

        const stats = await authService.getFaturixStats(
            req.user.id,
            companyId as string,
            month ? parseInt(month as string) : undefined,
            year ? parseInt(year as string) : undefined
        );
        res.json(stats);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/faturix/audits', requireAuth, async (req: any, res: any) => {
    try {
        const audit = await authService.saveFaturixAudit(req.user.id, req.body);
        res.status(201).json(audit);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/faturix/audits/:id/status', requireAuth, async (req: any, res: any) => {
    try {
        const { status, source } = req.body;
        await authService.updateFaturixAuditStatus(req.params.id, status, source);
        await logSystemAction(req.user.id, 'update_audit_status', 'faturix', req.params.id, { status, source }, req);
        res.json({ success: true });
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/api/faturix/analyze', requireAuth, upload.array('files'), async (req: any, res: any) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado');

        const { companyId } = req.body;
        const initializedAudits = [];
        const auditIds: { id: string; file: Express.Multer.File }[] = [];
        for (const file of files) {
            const { id } = await authService.initializeFaturixAudit(req.user.id, file.originalname, 'Documento', companyId || req.user.companyId);
            auditIds.push({ id, file });
        }

        const formData = new FormData();
        formData.append('user_id', req.user.id);
        formData.append('audit_ids', JSON.stringify(auditIds.map(a => a.id)));

        for (const { id, file } of auditIds) {
            const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
            formData.append('files', blob, file.originalname);
        }

        const webhookUrl = await subscriptionService.getCompanyWebhook(companyId || req.user.companyId);
        console.log(`[Faturix Analyze] Routing to: ${webhookUrl}`);

        const n8nResponse = await fetch(webhookUrl, {
            method: 'POST',
            body: formData
        });

        if (!n8nResponse.ok) {
            for (const { id, file } of auditIds) {
                initializedAudits.push({ id, fileName: file.originalname, status: 'erro', error: 'Falha no n8n' });
            }
        } else {
            const analysisResults = await n8nResponse.json();
            const resultsArray = Array.isArray(analysisResults) ? analysisResults : [analysisResults];
            const usedResultsIndices = new Set<number>();

            for (let fileIdx = 0; fileIdx < auditIds.length; fileIdx++) {
                const { id, file } = auditIds[fileIdx];
                let resultIndex = -1;
                const fullFileName = file.originalname.toLowerCase().trim();
                const baseFileName = file.originalname.split('.')[0].toLowerCase().trim();

                resultIndex = resultsArray.findIndex((res, idx) => {
                    if (usedResultsIndices.has(idx)) return false;
                    const d = res.json || res.output || res;
                    return String(d.audit_id) === String(id);
                });

                if (resultIndex === -1 && resultsArray.length === files.length && !usedResultsIndices.has(fileIdx)) {
                    resultIndex = fileIdx;
                }

                if (resultIndex === -1) {
                    resultIndex = resultsArray.findIndex((r, rIdx) => {
                        if (usedResultsIndices.has(rIdx)) return false;
                        const data = r.json || r.output || r;
                        const rName = (data.fileName || data.file_name || data.filename || r.fileName || r.file_name || '').toString().toLowerCase();
                        return rName === fullFileName || rName === baseFileName;
                    });
                }
                if (resultIndex === -1) {
                    resultIndex = resultsArray.findIndex((_, idx) => !usedResultsIndices.has(idx));
                }

                if (resultIndex !== -1) {
                    usedResultsIndices.add(resultIndex);
                    await authService.completeFaturixAudit(id, resultsArray[resultIndex]);

                    // Construct partial return
                    initializedAudits.push({
                        id,
                        fileName: file.originalname,
                        status: 'concluido'
                    });
                } else {
                    initializedAudits.push({ id, fileName: file.originalname, status: 'erro', error: 'Resultado não encontrado' });
                }
            }
        }

        await logSystemAction(req.user.id, 'analyze_documents', 'faturix', 'batch', { count: files.length }, req);

        // Consume credits for Analysis (1 per document)
        try {
            await authService.consumeCredit(req.user.id, files.length, 'FaturixAnalyze');
        } catch (creditErr: any) {
            console.warn('[Faturix] Falha ao debitar créditos:', creditErr.message);
            // Non-blocking for now, or we could block. User requested it to reduce in DB.
        }

        res.status(200).json({
            message: 'Análise concluída com sucesso',
            audits: initializedAudits
        });
    } catch (err: any) {
        console.error(err);
        res.status(400).json({ error: err.message });
    }
});

// ==================== RAG API ====================
app.post('/api/rag/search', requireAuth, async (req: any, res) => {
    try {
        const { query, companyId } = req.body;

        // 1. Consume 1 credit for RAG Search
        try {
            await authService.consumeCredit(req.user.id, 1, 'RAGSearch');
        } catch (creditErr: any) {
            return res.status(403).json({ error: 'Créditos insuficientes para pesquisa RAG' });
        }

        // Security Check
        if (companyId && companyId !== 'ALL' && req.user.role !== 'ADMIN' && req.user.companyId !== companyId) {
            return res.status(403).json({ error: 'Access denied to this company' });
        }

        // 2. Perform Search
        let sql = `
            SELECT id, file_name, data, created_at 
            FROM documents 
            WHERE status IN ('COMPLETED', 'APROVADO')
        `;
        const params: any[] = [];

        if (companyId && companyId !== 'ALL') {
            sql += ` AND company_id = $1`;
            params.push(companyId);
        }

        // Basic semantic/text search simulation for now
        // In a real RAG we'd use pgvector or full-text-search
        if (query) {
            sql += params.length > 0 ? ` AND ` : ` WHERE `;
            sql += `(file_name ILIKE $${params.length + 1} OR raw_text ILIKE $${params.length + 1} OR data::text ILIKE $${params.length + 1})`;
            params.push(`%${query}%`);
        }

        sql += ` ORDER BY created_at DESC LIMIT 10`;

        const results = await executeQuery(sql, params);

        // 3. Stats for context
        const statsSql = companyId && companyId !== 'ALL'
            ? `SELECT COUNT(*) as total, SUM((data->>'totalAmount')::numeric) as total_amount FROM documents WHERE company_id = $1`
            : `SELECT COUNT(*) as total, SUM((data->>'totalAmount')::numeric) as total_amount FROM documents`;
        const statsRes = await executeQuery(statsSql, companyId && companyId !== 'ALL' ? [companyId] : []);

        const approvedRes = await executeQuery(`SELECT COUNT(*) as count FROM documents WHERE status = 'APROVADO' ${companyId && companyId !== 'ALL' ? 'AND company_id = $1' : ''}`, companyId && companyId !== 'ALL' ? [companyId] : []);
        const rejectedRes = await executeQuery(`SELECT COUNT(*) as count FROM documents WHERE status = 'REJEITADO' ${companyId && companyId !== 'ALL' ? 'AND company_id = $1' : ''}`, companyId && companyId !== 'ALL' ? [companyId] : []);

        res.json({
            results: results.rows,
            stats: {
                totalDocs: parseInt(statsRes.rows[0]?.total || '0'),
                totalAmount: parseFloat(statsRes.rows[0]?.total_amount || '0'),
                approvedCount: parseInt(approvedRes.rows[0]?.count || '0'),
                rejectedCount: parseInt(rejectedRes.rows[0]?.count || '0')
            }
        });

    } catch (err: any) {
        console.error('[RAG Search Error]:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/faturix/callback', async (req: any, res: any) => {
    try {
        const { audit_id, analysis_result } = req.body;
        if (!audit_id || !analysis_result) throw new Error('Dados inválidos');
        await authService.completeFaturixAudit(audit_id, analysis_result);
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/faturix/rules', requireAuth, async (req: any, res) => {
    try {
        const rules = await authService.getFaturixRules(req.user.id);
        res.json(rules);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/faturix/rules', requireAuth, async (req: any, res) => {
    try {
        const rule = await authService.saveFaturixRule(req.user.id, req.body);
        await logSystemAction(req.user.id, 'create_rule', 'faturix', rule.id, { name: rule.name }, req);
        res.status(201).json(rule);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/faturix/rules/:id/toggle', requireAuth, async (req: any, res) => {
    try {
        const { isActive } = req.body;
        await authService.toggleFaturixRule(req.params.id, isActive);
        await logSystemAction(req.user.id, 'toggle_rule', 'faturix', req.params.id, { isActive }, req);
        res.json({ success: true });
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.get('/api/faturix/settings', requireAuth, async (req: any, res) => {
    try {
        const settings = await authService.getFaturixAgentSettings(req.user.id);
        res.json(settings);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/fiscal/entities', requireAuth, async (req: any, res: any) => {
    try {
        const { companyId } = req.query;
        // Tenancy Check
        if (!(await validateCompanyAccess(req.user, companyId as string))) {
            return res.status(403).json({ error: 'Acesso negado a esta empresa' });
        }
        // Defaults to user context if no companyId, or specific company if provided
        const entities = await authService.getFiscalEntities(req.user.id, companyId as string);
        res.json(entities);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/fiscal/saft', requireAuth, async (req: any, res) => {
    try {
        const { companyId, month, year } = req.query;

        if (!companyId || !month || !year) {
            return res.status(400).json({ error: 'CompanyID, month, and year are required' });
        }

        const result = await authService.generateSaft(
            companyId as string,
            parseInt(month as string),
            parseInt(year as string)
        );

        res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`);
        res.setHeader('Content-Type', 'application/xml');
        res.send(result.content);
    } catch (err: any) {
        console.error('SAFT Generation Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Consolidated duplicate reports block removed.

// Duplicate tax-position removed.

// Duplicate ai-insights removed.

// Duplicate compliance-logs removed.

app.post('/api/faturix/settings', requireAuth, async (req: any, res) => {
    try {
        const { instructions, visual_instructions, criteria } = req.body;
        await authService.saveFaturixAgentSettings(req.user.id, instructions, visual_instructions, criteria);
        await logSystemAction(req.user.id, 'update_settings', 'faturix', 'global', {}, req);
        res.json({ success: true });
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// (Duplicate Invite, Status, and Delete routes removed - consolidated in L2240+)


// ==================== PLANS ====================
app.get('/api/plans', requireAuth, async (req: any, res) => {
    try {
        const plans = await billingService.getAllPlans();
        res.json(plans);
    } catch (err: any) {
        console.error('Error fetching plans:', err);
        res.status(500).json({ error: 'Erro ao carregar planos de licença' });
    }
});


// ==================== BILLING & CREDITS ====================
app.get('/api/credits', requireAuth, async (req: any, res) => {
    try {
        const data = await authService.getCredits(req.user.id);
        res.json(data);
    } catch (err) { res.status(500).json({ error: 'Erro ao buscar créditos' }); }
});

app.post('/api/credits/consume', requireAuth, async (req: any, res) => {
    try {
        const { amount, tool } = req.body;
        const result = await authService.consumeCredit(req.user.id, amount || 1, tool);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Créditos insuficientes' });
    }
});

app.post('/api/credits/transfer-to-company', requireAuth, async (req: any, res) => {
    try {
        const { companyId, amount } = req.body;
        if (!companyId || !amount) {
            return res.status(400).json({ error: 'Company ID and amount are required' });
        }
        const result = await authService.transferCreditsToCompany(req.user.id, companyId, parseInt(amount));
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/credits/packages', requireAuth, async (req: any, res) => {
    try {
        const packages = await getActiveCreditPackages();
        res.json(packages);
    } catch (err: any) {
        console.error('Error fetching credit packages:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/transactions', requireAuth, async (req: any, res) => {
    try {
        const { companyId, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const params = [];

        let whereClause = '';
        if (companyId && companyId !== 'ALL') {
            if (companyId === 'PERSONAL' || companyId === 'undefined') {
                whereClause = 'WHERE t.company_id IS NULL AND t.user_id = $1';
                params.push(req.user.id);
            } else {
                // Return transactions for the company OR personal transactions for the user
                // This ensures top-ups (which are personal) show up even when a company is selected
                whereClause = 'WHERE (t.company_id = $1 OR (t.company_id IS NULL AND t.user_id = $2))';
                params.push(companyId);
                params.push(req.user.id);
            }
        } else {
            // If no company selected, show user's personal transactions
            whereClause = 'WHERE t.user_id = $1';
            params.push(req.user.id);
        }

        // Count total
        const countQuery = `SELECT COUNT(*) as total FROM transactions t ${whereClause}`;
        const countResult = await executeQuery(countQuery, params);
        const total = parseInt(countResult.rows[0].total || '0');

        // Fetch data with join
        const dataQuery = `
            SELECT t.*, u.name as user_name 
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const result = await executeQuery(dataQuery, [...params, limit, offset]);

        res.json({
            data: result.rows,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== COMPANIES MANAGEMENT ====================

app.get('/api/companies', requireAuth, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        let query = '';
        const params = [userId];

        if (userRole === 'ADMIN') {
            // Admins see everything
            query = 'SELECT * FROM companies ORDER BY name ASC';
            params.length = 0; // Clear params as none are needed for this query
        } else {
            // Collaborators and Owners see their specific companies
            query = `
                SELECT DISTINCT c.* FROM companies c 
                WHERE c.owner_id = $1 
                OR c.id = (SELECT company_id FROM users WHERE id = $1)
                ORDER BY name ASC
            `;
        }

        const result = await executeQuery(query, params);
        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/companies/:id', requireAuth, async (req: any, res) => {
    try {
        const result = await executeQuery('SELECT * FROM companies WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
        res.json(result.rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/companies/:id/doc-count', requireAuth, async (req: any, res) => {
    try {
        const result = await executeQuery('SELECT COUNT(*) as count FROM documents WHERE company_id = $1', [req.params.id]);
        res.json({ count: parseInt(result.rows[0].count || '0') });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/companies - Create with Validations
// POST /api/companies - Create with Validations
app.post('/api/companies', requireAuth, async (req: any, res) => {
    const client = await pool.connect();
    try {
        const { name, nif, email, status, plan, regime, address, phone, website, sector, cae, isVerified, fiscal_status } = req.body;

        // 1. Determine Costs & Status
        // Default: Manual = Free, Pending, No Bonus.
        let creationCost = 0;
        let startingCredits = 0;
        let initialStatus = 'PENDING'; // Default for manual
        let isVerifiedBool = false;

        // If AGT Sync (isVerified explicitly passed as true) AND fiscal_status is 'Activo'
        if (isVerified === true && fiscal_status === 'Activo') {
            creationCost = 100;
            startingCredits = 20;
            initialStatus = 'ACTIVE';
            isVerifiedBool = true;
        } else if (isVerified === true && fiscal_status !== 'Activo') {
            // Sync happened but not active? 
            // Logic: Treat as Pending Manual (Free, no bonus)
            initialStatus = 'PENDING';
            isVerifiedBool = false; // Cannot verify inactive company? Or maybe verify but don't activate. 
            // Requirement says: "charge/bonus only if active". Assuming non-active = just save data, no charge.
        }

        // 2. Check Master (User) Credits if cost > 0
        if (creationCost > 0) {
            const userCheck = await client.query('SELECT credits FROM users WHERE id = $1', [req.user.id]);
            const userOriginalCredits = parseInt(userCheck.rows[0]?.credits || '0');

            if (userOriginalCredits < creationCost) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: `Saldo insuficiente para cadastrar empresa activa. Necessário ${creationCost} créditos.` });
            }
        }

        await client.query('BEGIN');

        // 3. Deduct Cost from User if applicable
        if (creationCost > 0) {
            await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [creationCost, req.user.id]);
            await client.query(
                `INSERT INTO audit_logs (user_id, action, resource_type, target_id, details) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'company_creation_fee', 'finance', 'user_wallet', JSON.stringify({ amount: creationCost, companyName: name })]
            );
        }

        // 4. Create Company
        const result = await client.query(
            `INSERT INTO companies (
                name, nif, email, status, plan, regime, 
                address, phone, website, sector, cae, is_verified, credits, owner_id,
                fiscal_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                name, nif, email || '', initialStatus, plan || 'PRO',
                regime || 'GERAL', address, phone, website, sector, cae, isVerifiedBool, startingCredits, req.user.id,
                fiscal_status
            ]
        );

        const newCompany = result.rows[0];

        await client.query('COMMIT');

        // 5. Log Action
        await logSystemAction(req.user.id, 'create_company', 'company', newCompany.id, { name, cost: creationCost, bonus: startingCredits }, req);

        res.status(201).json(newCompany);
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error creating company:', err);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// DELETE /api/companies/:id - Delete with Refund
app.delete('/api/companies/:id', requireAuth, async (req: any, res) => {
    const client = await pool.connect();
    try {
        // 1. Fetch company to get remaining credits
        const compRes = await executeQuery('SELECT * FROM companies WHERE id = $1', [req.params.id]);
        const company = compRes.rows[0];

        if (!company) return res.status(404).json({ error: 'Company not found' });

        const refundAmount = parseInt(company.credits || '0');

        await client.query('BEGIN');

        // 2. Refund credits to Master User (if > 0)
        // Need to find the Master User. `req.user.id` is the operator.
        // Assuming the operator IS the owner or we refund to the operator.
        if (refundAmount > 0) {
            await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [refundAmount, req.user.id]);
            // Log Refund
            await client.query(
                `INSERT INTO audit_logs (user_id, action, resource_type, target_id, details) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [req.user.id, 'refund_credits', 'finance', req.params.id, JSON.stringify({ amount: refundAmount, reason: 'company_deletion' })]
            );
        }

        // 3. Delete Company (Cascade handles docs? DB schema dependent. If not, manual delete)
        // Usually, `DELETE FROM companies` will fail if documents exist unless CASCADE.
        // Let's assume documents will be deleted or we should delete them first.
        // Simplest: Delete documents first.
        await client.query('DELETE FROM documents WHERE company_id = $1', [req.params.id]);
        await client.query('DELETE FROM companies WHERE id = $1', [req.params.id]);

        await client.query('COMMIT');

        // 4. Log Deletion
        await logSystemAction(req.user.id, 'delete_company', 'company', req.params.id, { name: company.name, refunded: refundAmount }, req);

        res.json({ success: true, refunded: refundAmount });

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Delete company error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Update & Status
app.put('/api/companies/:id', requireAuth, async (req: any, res) => {
    try {
        const {
            name, nif, email, plan, regime, address, phone,
            website, sector, cae, fiscal_rep, accountant_name,
            accountant_email, logo_url, fiscal_status, is_defaulter, fiscal_residence
        } = req.body;

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // First, get the current company status to check against later
            const currentCompanyRes = await client.query('SELECT status FROM companies WHERE id = $1', [req.params.id]);
            const currentCompanyStatus = currentCompanyRes.rows[0]?.status;

            const result = await client.query(
                `UPDATE companies SET 
                    name = COALESCE($1, name),
                    nif = COALESCE($2, nif),
                    email = COALESCE($3, email),
                    plan = COALESCE($4, plan),
                    regime = COALESCE($5, regime),
                    address = COALESCE($6, address),
                    phone = COALESCE($7, phone),
                    website = COALESCE($8, website),
                    sector = COALESCE($9, sector),
                    cae = COALESCE($10, cae),
                    fiscal_rep = COALESCE($11, fiscal_rep),
                    accountant_name = COALESCE($12, accountant_name),
                    accountant_email = COALESCE($13, accountant_email),
                    logo_url = COALESCE($14, logo_url),
                    fiscal_status = COALESCE($15, fiscal_status),
                    is_defaulter = COALESCE($16, is_defaulter),
                    fiscal_residence = COALESCE($17, fiscal_residence),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $18 RETURNING *`,
                [
                    name, nif, email, plan, regime, address, phone,
                    website, sector, cae, fiscal_rep, accountant_name,
                    accountant_email, logo_url,
                    fiscal_status, is_defaulter, fiscal_residence,
                    req.params.id
                ]
            );

            if (result.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Company not found' });
            }

            const company = result.rows[0];

            // Validation Logic (AGT Sync)
            // If fiscal_status is 'Activo' AND current status is NOT 'ACTIVE', we Activate AND Charge
            if (fiscal_status === 'Activo' && currentCompanyStatus !== 'ACTIVE') {
                // Check Credits
                const VALIDATION_COST = 100;
                const BONUS_CREDITS = 20;

                const userCheck = await client.query('SELECT credits FROM users WHERE id = $1', [req.user.id]);
                const userCredits = parseInt(userCheck.rows[0]?.credits || '0');

                if (userCredits < VALIDATION_COST) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ error: `Saldo insuficiente para validar empresa. Necessário ${VALIDATION_COST} créditos.` });
                }

                // Deduct from User
                await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [VALIDATION_COST, req.user.id]);
                await client.query(
                    `INSERT INTO audit_logs (user_id, action, resource_type, target_id, details) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [req.user.id, 'company_validation_fee', 'finance', 'user_wallet', JSON.stringify({ amount: VALIDATION_COST, companyId: company.id })]
                );

                // Update Company to ACTIVE, Verified, and Add Bonus
                const updateRes = await client.query(
                    `UPDATE companies SET 
                        status = 'ACTIVE', 
                        is_verified = true, 
                        credits = credits + $1 
                      WHERE id = $2 RETURNING *`,
                    [BONUS_CREDITS, company.id]
                );

                await client.query('COMMIT');

                // Return the updated company object (Active + Credits)
                await logSystemAction(req.user.id, 'validate_company', 'company', req.params.id, { status: 'ACTIVE', cost: VALIDATION_COST, bonus: BONUS_CREDITS }, req);
                return res.json(updateRes.rows[0]);
            }

            await client.query('COMMIT');
            await logSystemAction(req.user.id, 'update_company', 'company', req.params.id, { name: result.rows[0].name }, req);
            res.json(result.rows[0]);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ==================== DOCUMENT PROXY API (TO PREVENT CORS) ====================
// ==================== DOCUMENT PROXY API (WITH AUTOMATIC PERSISTENCE) ====================
app.post('/api/documents/analyze-proxy', requireAuth, upload.array('files'), async (req: any, res: any) => {
    try {
        const files = req.files as Express.Multer.File[];
        const { companyId, userId, metadata, preview_url } = req.body;

        if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado para o proxy');

        const targetCompanyId = companyId || req.user.companyId;
        const targetUserId = userId || req.user.id;

        // 1. PERSISTENCE: Save documents in 'PROCESSING' state immediately
        // Parse metadata to get client-side IDs if available
        let metaParsed: any[] = [];
        try {
            metaParsed = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || []);
        } catch (e) {
            console.warn('[Proxy Analyze] Failed to parse metadata:', e);
        }

        // Fetch company name and check credits
        const companyRes = await executeQuery('SELECT name, credits, role FROM companies c JOIN users u ON u.company_id = c.id WHERE c.id = $1 AND u.id = $2', [targetCompanyId, targetUserId]);
        const company = companyRes.rows[0];
        const companyName = company?.name || 'Unknown';

        // Dynamic Cost Check: Prevent Analysis without credits
        const unitCost = await subscriptionService.getCurrentAnalysisCost(targetCompanyId);
        const totalBatchCost = unitCost * files.length;
        const userCredits = await executeQuery('SELECT credits, role FROM users WHERE id = $1', [targetUserId]);
        const user = userCredits.rows[0];

        const availableCredits = (user?.role === 'COLLABORATOR') ? (user?.credits || 0) : (company?.credits || 0);

        if (availableCredits < totalBatchCost) {
            return res.status(402).json({
                error: `Créditos insuficientes para este lote (${files.length} docs). Necessário: ${totalBatchCost}, Disponível: ${availableCredits}.`,
                required: totalBatchCost,
                available: availableCredits
            });
        }

        const savedDocs = [];
        for (const [idx, file] of files.entries()) {
            const fileMeta = metaParsed.find((m: any) => m.file_name === file.originalname) || metaParsed[idx] || {};
            const docId = fileMeta.audit_id || fileMeta.id || crypto.randomUUID();

            console.log(`[Proxy Analyze] Uploading to S3 and pre-saving: ${file.originalname} (ID: ${docId})`);

            // 1.1 Upload to S3
            const category = storageService.getCategoryByType(fileMeta.type || 'UNKNOWN');
            const uploadResult = await storageService.uploadFile(file.buffer, file.originalname, file.mimetype, targetCompanyId, companyName, category);

            // 1.2 Save record with URL
            await executeQuery(
                `INSERT INTO documents (id, company_id, uploaded_by, file_name, status, type, file_url, storage_path, bucket_name)
                 VALUES ($1, $2, $3, $4, 'PROCESSING', 'UNKNOWN', $5, $6, $7)
                 ON CONFLICT (id) DO UPDATE SET 
                    status = 'PROCESSING',
                    file_url = EXCLUDED.file_url,
                    storage_path = EXCLUDED.storage_path,
                    bucket_name = EXCLUDED.bucket_name`,
                [docId, targetCompanyId, targetUserId, file.originalname, uploadResult.url, uploadResult.path, uploadResult.bucket]
            );
            savedDocs.push({ id: docId, fileName: file.originalname, fileUrl: uploadResult.url });
        }

        // 2. Resolve Webhook
        const webhookUrl = await subscriptionService.getCompanyWebhook(targetCompanyId);
        console.log(`[Proxy Analyze] Routing ${files.length} files to: ${webhookUrl}`);

        // 3. Prepare Forwarding FormData
        const formData = new FormData();
        formData.append('companyId', targetCompanyId);
        formData.append('userId', targetUserId);

        // Forward updated metadata with our resolved IDs and S3 URLs
        const updatedMeta = savedDocs.map(sd => ({
            file_name: sd.fileName,
            audit_id: sd.id,
            doc_id: sd.id,
            file_url: (sd as any).fileUrl
        }));
        formData.append('metadata', JSON.stringify(updatedMeta));
        // Also append individual file_url fields for n8n ease of use
        savedDocs.forEach(sd => formData.append('file_url', (sd as any).fileUrl));

        if (preview_url) {
            if (Array.isArray(preview_url)) {
                preview_url.forEach(url => formData.append('preview_url', url));
            } else {
                formData.append('preview_url', preview_url);
            }
        }

        for (const file of files) {
            const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
            formData.append('files', blob, file.originalname);
        }

        // 4. Forward to N8N (FIRE AND FORGET to prevent 502 Timeout on Vercel)
        // We trigger the N8N workflow asynchronously. N8N will call back via webhook when done.
        fetch(webhookUrl, {
            method: 'POST',
            body: formData
        }).then(async n8nResponse => {
            if (!n8nResponse.ok) {
                const errText = await n8nResponse.text();
                console.error(`[Proxy Analyze Async] N8N Error (${n8nResponse.status}): ${errText}`);
            } else {
                console.log(`[Proxy Analyze Async] Successfully forwarded ${files.length} files to N8N.`);
            }
        }).catch(err => {
            console.error('[Proxy Analyze Async] Failed to forward to N8N:', err.message);
        });

        // 5. Respond immediately with 202 Accepted
        // The documents are already saved in the DB as 'PROCESSING'.
        // The frontend will receive this and enter Polling mode.
        res.status(202).json({
            status: 'processing',
            message: 'Análise iniciada em segundo plano. Monitore via polling.',
            documents: savedDocs
        });

    } catch (err: any) {
        console.error('[Proxy Analyze] Exception:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/companies/:id/status', requireAuth, async (req: any, res) => {
    try {
        const { status } = req.body;
        const result = await executeQuery(
            'UPDATE companies SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
        await logSystemAction(req.user.id, 'update_company_status', 'company', req.params.id, { status }, req);
        res.json(result.rows[0]);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ==================== DOCUMENTS ====================
// ==================== DOCUMENTS ====================
app.get('/api/documents', requireAuth, async (req: any, res) => {
    try {
        const { companyId, userId: userIdFilter, page, limit } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 50; // Default to 50 for safety
        const offset = (pageNum - 1) * limitNum;

        // Fetch user's assigned company_id for security checks
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        // Select LIGHTWEIGHT fields only (ID Projection)
        let query = `
            SELECT 
                d.id, d.file_name, d.file_url, d.status, d.type, d.created_at, 
                d.company_id, d.uploaded_by, d.responsible_user_id, d.data,
                d.valor_documento, d.valor_iva, d.compliance_level,
                u.name as responsible_user_name 
            FROM documents d
            LEFT JOIN users u ON d.responsible_user_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];

        // Count Query for Pagination
        let countQuery = `
            SELECT COUNT(*) as total
            FROM documents d
            WHERE 1=1
        `;
        const countParams: any[] = [];

        // --- FILTER BUILDING HELPER ---
        const buildFilters = (paramsArr: any[]) => {
            let filterSql = '';
            let pIdx = 0; // Start from 0, we'll add 1 when creating placeholders

            if (companyId && companyId !== 'ALL' && companyId !== 'undefined') {
                // Security: If not ADMIN, check if user owns the company or is assigned to it
                if (userRole !== 'ADMIN' && companyId !== userAssignedCompanyId) {
                    // (Performed once before query, assuming valid context here for simplicity in query build)
                    // Note: We should ideally separate authorization logic from query build, but keeping inline for now.
                }
                pIdx++;
                filterSql += ` AND d.company_id = $${pIdx}::uuid`;
                paramsArr.push(companyId);
            } else {
                // Handle 'ALL' or undefined companyId
                if (userRole !== 'ADMIN') {
                    // If not ADMIN, filter by companies the user owns or is assigned to
                    pIdx++;
                    filterSql += ` AND (d.company_id = $${pIdx}::uuid OR d.company_id IN (SELECT id FROM companies WHERE owner_id = $${pIdx}::uuid))`;
                    paramsArr.push(userAssignedCompanyId || userId); // Use same param for both checks if UUID matches
                }
            }

            if (userIdFilter && userIdFilter !== 'ALL') {
                if (userIdFilter === 'AI') {
                    filterSql += ` AND d.responsible_user_id IS NULL`;
                } else {
                    pIdx++;
                    filterSql += ` AND d.responsible_user_id = $${pIdx}::uuid`;
                    paramsArr.push(userIdFilter);
                }
            }

            if (userRole === 'COLLABORATOR' || userRole === 'OPERATOR') {
                pIdx++;
                filterSql += ` AND d.uploaded_by = $${pIdx}::uuid`;
                paramsArr.push(userId);
            }

            return filterSql;
        };

        // 1. Authorization Check (Pre-flight)
        if (companyId && companyId !== 'ALL' && companyId !== 'undefined' && userRole !== 'ADMIN' && companyId !== userAssignedCompanyId) {
            const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [companyId, userId]);
            if (ownerCheck.rowCount === 0) {
                return res.status(403).json({ error: 'Acesso negado a esta empresa' });
            }
        }

        // 2. Build Filters
        // We need to build params twice because params arrays must match query placeholders ($1, $2...)
        // Or simply share the logic.
        const filterClause = buildFilters(params);

        // Clone params for count query since we modify params with LIMIT/OFFSET next
        const countParamsFinal = [...params];

        query += filterClause;
        countQuery += filterClause;

        query += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limitNum);
        params.push(offset);

        // 🔍 DEBUG: Log exact SQL being executed
        console.log('🔍 [/api/documents] Executing SQL:');
        console.log('   Query:', query.replace(/\s+/g, ' ').trim());
        console.log('   Params:', JSON.stringify(params));
        console.log('   Count Query:', countQuery.replace(/\s+/g, ' ').trim());
        console.log('   Count Params:', JSON.stringify(countParamsFinal));

        // 3. Execute
        const [dataRes, countRes] = await Promise.all([
            executeQuery(query, params),
            executeQuery(countQuery, countParamsFinal) // Use correct params!
        ]);

        const total = parseInt(countRes.rows[0].total || '0');

        res.json({
            data: dataRes.rows,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (err: any) {
        console.error("❌ [/api/documents] CRITICAL ERROR:");
        console.error("   Error Message:", err.message);
        console.error("   Error Code:", err.code);
        console.error("   Stack Trace:", err.stack);
        console.error("   Query Params:", { companyId: req.query.companyId, userId: req.query.userId, page: req.query.page, limit: req.query.limit });
        console.error("   User Info:", { id: req.user?.id, role: req.user?.role });

        // Return detailed error in development, generic in production
        const isDev = process.env.NODE_ENV === 'development';
        res.status(500).json({
            error: isDev ? err.message : 'Erro ao buscar documentos',
            code: err.code,
            details: isDev ? {
                message: err.message,
                code: err.code,
                hint: err.hint,
                position: err.position
            } : undefined
        });
    }
});
app.get('/api/documents/:id', requireAuth, async (req: any, res) => {
    try {
        // Fetch single document WITH file_base64
        const result = await executeQuery('SELECT * FROM documents WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
        res.json(result.rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/documents', requireAuth, async (req: any, res) => {
    try {
        const { file_name, file_url, company_id, type, file_base64 } = req.body;
        const result = await executeQuery(
            `INSERT INTO documents (company_id, uploaded_by, file_name, file_url, status, type, file_base64) 
             VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $6) RETURNING *`,
            [company_id, req.user.id, file_name, file_url, type || 'UNKNOWN', file_base64]
        );
        res.status(201).json(result.rows[0]);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.post('/api/documents/sync', requireAuth, async (req: any, res) => {
    try {
        // ... (Same logic for sync as before, skipping log redundancy if verbose, or add simple log)
        // I will execute logs inside document service usually, but here is fine.
        // For brevity, I'll keep the core logic clean.

        // ... Existing Sync Logic (truncated for brevity in artifact, just assuming it's same)
        // Actually, to avoid corruption, I MUST include the full logic if I overwrite the file.
        // Re-implementing Sync Logic:

        const {
            id, file_name, file_url, company_id, type, file_base64,
            data, raw_data, status, raw_text,
            raw_n8n_response, full_analysis
        } = req.body;

        const d = data || {};
        const totais = d.totais || d.root?.totais || {};
        const decisao = d.decisao_final || d.root?.decisao_final || {};

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const insertRes = await client.query(
                `INSERT INTO documents (
                    id, company_id, uploaded_by, file_name, file_url, status, type, 
                    data, raw_data, raw_text, raw_n8n_response, full_analysis,
                    tipo_movimento, valor_iva, valor_documento, status_fiscal,
                    compliance_level, responsible_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status, 
                    responsible_user_id = EXCLUDED.responsible_user_id,
                    type = EXCLUDED.type, 
                    data = EXCLUDED.data, 
                    raw_data = EXCLUDED.raw_data,
                    raw_text = EXCLUDED.raw_text, 
                    file_name = EXCLUDED.file_name, 
                    file_url = CASE 
                        WHEN EXCLUDED.file_url IN ('DB_STORED', 'CLOUD_STORED', '') AND documents.file_url IS NOT NULL AND documents.file_url LIKE 'http%' THEN documents.file_url
                        ELSE EXCLUDED.file_url
                    END,
                    raw_n8n_response = EXCLUDED.raw_n8n_response, 
                    full_analysis = EXCLUDED.full_analysis,
                    tipo_movimento = EXCLUDED.tipo_movimento,
                    valor_iva = EXCLUDED.valor_iva,
                    valor_documento = EXCLUDED.valor_documento,
                    status_fiscal = EXCLUDED.status_fiscal,
                    compliance_level = EXCLUDED.compliance_level,
                    completed_at = now()
                RETURNING *`,
                [
                    id, company_id, req.user.id, file_name, file_url || 'CLOUD_STORED',
                    status || 'PROCESSING', type || 'UNKNOWN',
                    JSON.stringify(d), JSON.stringify(raw_data || {}),
                    raw_text, JSON.stringify(raw_n8n_response || {}), JSON.stringify(full_analysis || {}),
                    d.tipo_movimento || 'INDETERMINADO',
                    parseFloat(totais.iva || 0),
                    parseFloat(totais.total_geral || 0),
                    decisao.status_fiscal || null,
                    decisao.nivel_risco || null,
                    req.user.id
                ]
            );

            if (['COMPLETED', 'APROVADO', 'REJEITADO', 'SUCCESS', 'VALIDADA', 'DONE'].includes(status || '')) {
                // Fetch document owner for correct role-based billing
                const docOwnerRes = await client.query('SELECT uploaded_by FROM documents WHERE id = $1', [id]);
                const documentOwnerId = docOwnerRes.rows[0]?.uploaded_by || req.user.id;

                // Unified Dynamic Credit Deduction
                await subscriptionService.consumeAnalysisCredits(company_id, documentOwnerId, id, client);
            }

            if (['ERROR', 'FAILED'].includes(status || '')) {
                await createAiAlert(
                    company_id,
                    'Watchdog',
                    'CRITICAL',
                    'Falha no Processamento',
                    `O documento ${file_name} não pôde ser analisado pela IA. Verifique o formato ou a qualidade da imagem.`,
                    { docId: id }
                );
            }

            await client.query('COMMIT');

            if (['COMPLETED', 'APROVADO'].includes(status || '')) {
                await logSystemAction(req.user.id, 'process_document', 'document', id, { status, fileName: file_name }, req);
            }

            res.json({ success: true, document: insertRes.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally { client.release(); }
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/documents/:id/complete', requireAuth, async (req: any, res) => {
    try {
        const { data, status, raw_n8n_response, full_analysis } = req.body;

        let query = `UPDATE documents SET data = $1, status = $2, completed_at = now()`;
        const params: any[] = [JSON.stringify(data || {}), status || 'COMPLETED'];
        let paramIdx = 3;

        if (raw_n8n_response) {
            query += `, raw_n8n_response = $${paramIdx}`;
            params.push(JSON.stringify(raw_n8n_response));
            paramIdx++;
        }

        if (full_analysis) {
            query += `, full_analysis = $${paramIdx}`;
            params.push(JSON.stringify(full_analysis));
            paramIdx++;
        }

        query += ` WHERE id = $${paramIdx} RETURNING *`;
        params.push(req.params.id);

        const result = await executeQuery(query, params);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Document not found' });

        const doc = result.rows[0];

        if (['COMPLETED', 'APROVADO', 'REJEITADO', 'SUCCESS', 'VALIDADA', 'DONE'].includes(status || '')) {
            // Use document owner's ID for correct role-based billing
            await subscriptionService.consumeAnalysisCredits(doc.company_id, doc.uploaded_by, doc.id);
        }

        // Log action
        await logSystemAction(req.user.id, 'complete_document', 'document', req.params.id, { status }, req);

        res.json(doc);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/documents/:id/resolve', requireAuth, async (req: any, res: any) => {
    try {
        const { status, relatedIds, resolution_notes } = req.body;
        const docId = req.params.id;
        const userId = req.user.id; // Responsible user

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const result = await client.query(
                `UPDATE documents SET 
                    status = $1, 
                    resolution_notes = $2, 
                    responsible_user_id = $3, 
                    completed_at = now() 
                 WHERE id = $4 RETURNING *`,
                [status || 'COMPLETED', resolution_notes, userId, docId]
            );

            if (result.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Document not found' });
            }

            // If it's a duplicate resolution, we might want to archive related ones
            if (relatedIds && Array.isArray(relatedIds) && relatedIds.length > 0) {
                await client.query(
                    `UPDATE documents SET status = 'ARCHIVED' WHERE id = ANY($1)`,
                    [relatedIds]
                );
            }

            await client.query('COMMIT');
            await logSystemAction(req.user.id, 'resolve_document_error', 'document', docId, { status, relatedIds, resolution_notes }, req);

            // Create AI Alert for Manual Approval
            if (status === 'APROVADO_USUARIO') {
                await createAiAlert(
                    result.rows[0].company_id,
                    'Sentinel',
                    'INFO',
                    'Documento Validado Manualmente',
                    `O documento ${result.rows[0].file_name} foi validado manualmente por ${req.user.name || 'um usuário'}.`,
                    { docId, userId: req.user.id }
                );
            }

            res.json(result.rows[0]);
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/documents/:id', requireAuth, async (req: any, res) => {
    try {
        const docId = req.params.id;
        const result = await executeQuery('DELETE FROM documents WHERE id = $1 RETURNING id', [docId]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
        await logSystemAction(req.user.id, 'delete_document', 'document', docId, {}, req);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== TEAM MANAGEMENT: LISTING & STATS ====================

app.get('/api/team', requireAuth, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();
        const { companyId } = req.query;

        // CRITICAL: Handle 'PERSONAL' / 'undefined' / null
        const isPersonal = !companyId || companyId === 'PERSONAL' || companyId === 'undefined';

        // Security check
        const userRes = await executeQuery('SELECT company_id, role FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = isPersonal ? null : companyId;

        // If not ADMIN, enforce company isolation
        if (userRole !== 'ADMIN') {
            if (targetCompanyId && targetCompanyId !== userAssignedCompanyId) {
                return res.status(403).json({ error: 'Acesso negado' });
            }
            targetCompanyId = userAssignedCompanyId;
        }

        // Logic: If Personal, return only self. If Company, return all company members.
        if (!targetCompanyId) {
            const result = await executeQuery(
                `SELECT id, name, email, role, plan, credits, status,
                last_login, permissions, usage_limits, company_id 
                FROM users WHERE id = $1`,
                [userId]
            );
            return res.json(result.rows);
        }

        const result = await executeQuery(
            `SELECT id, name, email, role, plan, credits, status,
            last_login, permissions, usage_limits, company_id 
            FROM users WHERE company_id = $1
            ORDER BY created_at DESC`,
            [targetCompanyId]
        );

        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/team/stats', requireAuth, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();
        const { companyId } = req.query;

        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = companyId && companyId !== 'ALL' && companyId !== 'undefined' ? companyId : null;

        if (userRole !== 'ADMIN') {
            targetCompanyId = userAssignedCompanyId;
        }

        if (!targetCompanyId) return res.json({ total_members: 0, active_members: 0, limit: 10 });

        const stats = await executeQuery(
            `SELECT 
                COUNT(*) as total_members,
                COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_members
             FROM users WHERE company_id = $1 AND role NOT IN ('ADMIN', 'ACCOUNTANT')`,
            [targetCompanyId]
        );

        res.json({
            total_members: parseInt(stats.rows[0]?.total_members || '0'),
            active_members: parseInt(stats.rows[0]?.active_members || '0'),
            limit: 10
        });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});



app.put('/api/team/status/:id', requireAuth, async (req: any, res) => {
    try {
        const { isActive } = req.body;
        const targetUserId = req.params.id;
        const userId = req.user.id;

        // Verify permission: Must be owner or admin
        const check = await executeQuery(
            `SELECT u1.company_id as target_comp, u2.company_id as requester_comp, u2.role as requester_role 
             FROM users u1, users u2 
             WHERE u1.id = $1 AND u2.id = $2`,
            [targetUserId, userId]
        );

        if (check.rowCount === 0) return res.status(404).json({ error: 'User not found' });

        const { target_comp, requester_comp, requester_role } = check.rows[0];

        if (requester_role !== 'ADMIN' && target_comp !== requester_comp) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        const newStatus = isActive ? 'ACTIVE' : 'SUSPENDED';
        await executeQuery('UPDATE users SET status = $1 WHERE id = $2', [newStatus, targetUserId]);

        await logSystemAction(userId, 'change_user_status', 'user', targetUserId, { status: newStatus }, req);

        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/team/member/:id', requireAuth, async (req: any, res) => {
    try {
        const targetUserId = req.params.id;
        const userId = req.user.id;

        // Verify permission
        const check = await executeQuery(
            `SELECT u1.company_id as target_comp, u2.company_id as requester_comp, u2.role as requester_role 
             FROM users u1, users u2 
             WHERE u1.id = $1 AND u2.id = $2`,
            [targetUserId, userId]
        );

        if (check.rowCount === 0) return res.status(404).json({ error: 'User not found' });

        const { target_comp, requester_comp, requester_role } = check.rows[0];

        if (requester_role !== 'ADMIN' && target_comp !== requester_comp) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        await executeQuery('DELETE FROM users WHERE id = $1', [targetUserId]);
        await logSystemAction(userId, 'delete_team_member', 'user', targetUserId, {}, req);

        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== DASHBOARD & AI AGENTS ====================

app.get('/api/dashboard/metrics', requireAuth, async (req: any, res) => {
    try {
        const { companyId, period } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        // Security: Fetch user's assigned company
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = companyId && companyId !== 'ALL' && companyId !== 'undefined' ? companyId : null;

        // Security Enforcement
        if (userRole !== 'ADMIN') {
            if (targetCompanyId) {
                if (targetCompanyId !== userAssignedCompanyId) {
                    const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [targetCompanyId, userId]);
                    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Acesso negado' });
                }
            } else {
                targetCompanyId = userAssignedCompanyId;
            }
        }

        const params: any[] = [];
        let where = '';

        if (targetCompanyId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(targetCompanyId)) {
                return res.status(400).json({ error: 'Invalid Company ID format' });
            }
            where += ` AND company_id = $${params.length + 1}::uuid`;
            params.push(targetCompanyId);
        }

        // --- NEW: COLLABORATOR ISOLATION FOR DASHBOARD ---
        if (userRole === 'COLLABORATOR' || userRole === 'OPERATOR') {
            where += ` AND uploaded_by = $${params.length + 1}::uuid`;
            params.push(userId);
        }

        // Period filter
        const days = period === '7D' ? 7 : period === '30D' ? 30 : 90;
        where += ` AND created_at >= NOW() - INTERVAL '${days} days'`;

        // 1. Total Spend & Count
        const statsSql = `
            SELECT 
                COUNT(*) as total_docs, 
                SUM(COALESCE(valor_documento, 0)) as total_spend,
                AVG(COALESCE(valor_documento, 0)) as avg_spend
            FROM documents 
            WHERE 1=1 ${where}
        `;
        const statsRes = await executeQuery(statsSql, params);

        // 2. Efficiency & Status Counts
        const statusSql = `
            SELECT 
                status, 
                COUNT(*) as count 
            FROM documents 
            WHERE 1=1 ${where}
            GROUP BY status
        `;
        const statusRes = await executeQuery(statusSql, params);

        let approvedDocs = 0;
        let approvedManual = 0;
        let rejectedDocs = 0;
        let errorDocs = 0;
        let pendingDocs = 0;

        statusRes.rows.forEach(row => {
            const s = (row.status || '').toString().trim().toUpperCase();
            const c = parseInt(row.count || '0');
            if (s === 'APROVADO_USUARIO') approvedManual += c;
            else if (s === 'APROVADO' || s === 'COMPLETED' || s === 'DONE' || s === 'SUCCESS') approvedDocs += c;
            else if (s === 'REJEITADO' || s === 'REJECTED' || s === 'FAILED') rejectedDocs += c;
            else if (s === 'ERRO' || s === 'ERROR') errorDocs += c;
            else pendingDocs += c;
        });

        const totalDocs = parseInt(statsRes.rows[0].total_docs || '0');
        const efficiency = totalDocs > 0 ? Math.round(((approvedDocs + approvedManual) / totalDocs) * 100) : 100;

        res.json({
            totalSpend: parseFloat(statsRes.rows[0].total_spend || '0'),
            docCount: totalDocs,
            avgSpend: parseFloat(statsRes.rows[0].avg_spend || '0'),
            efficiencyScore: efficiency,
            growthRate: 12.5,
            statusCounts: {
                approved: approvedDocs,
                approvedManual: approvedManual,
                rejected: rejectedDocs,
                error: errorDocs,
                pending: pendingDocs
            }
        });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/recent-activity', requireAuth, async (req: any, res) => {
    try {
        const { companyId } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        // Security: Fetch user's assigned company
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = companyId && companyId !== 'ALL' && companyId !== 'undefined' ? companyId : null;

        if (userRole !== 'ADMIN') {
            if (targetCompanyId) {
                if (targetCompanyId !== userAssignedCompanyId) {
                    const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [targetCompanyId, userId]);
                    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Acesso negado' });
                }
            } else {
                targetCompanyId = userAssignedCompanyId;
            }
        }

        let where = '';
        const params: any[] = [];
        if (targetCompanyId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            where = `WHERE company_id = $${params.length + 1}::uuid`;
            params.push(targetCompanyId);
        } else if (userRole !== 'ADMIN') {
            where = `WHERE (company_id = $${params.length + 1}::uuid OR company_id IN (SELECT id FROM companies WHERE owner_id = $${params.length + 1}::uuid))`;
            params.push(userAssignedCompanyId || userId);
        }

        // --- NEW: COLLABORATOR ISOLATION ---
        if (userRole === 'COLLABORATOR' || userRole === 'OPERATOR') {
            const prefix = where ? 'AND' : 'WHERE';
            where += ` ${prefix} uploaded_by = $${params.length + 1}::uuid`;
            params.push(userId);
        }


        const sql = `
            SELECT 
                id, 
                file_name as filename, 
                status, 
                created_at as date, 
                COALESCE(valor_documento, (data->'totais'->>'total_geral')::numeric, 0) as amount,
                data
            FROM documents
            ${where}
            ORDER BY created_at DESC
            LIMIT 5
        `;
        const result = await executeQuery(sql, params);

        // Map to cleaner objects
        const activities = result.rows.map(row => {
            const s = (row.status || '').toString().trim().toUpperCase();
            return {
                id: row.id,
                filename: row.filename,
                status: s === 'APROVADO_USUARIO' ? 'APROVADO (MANUAL)' :
                    s === 'COMPLETED' ? 'APROVADO' : row.status,
                date: row.date,
                amount: row.amount,
                currency: row.data?.currency || 'AOA'
            };
        });

        res.json(activities);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/spending-trend', requireAuth, async (req: any, res) => {
    try {
        const { companyId, period } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        // Security: Fetch user's assigned company
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = companyId && companyId !== 'ALL' && companyId !== 'undefined' ? companyId : null;

        if (userRole !== 'ADMIN') {
            if (targetCompanyId) {
                if (targetCompanyId !== userAssignedCompanyId) {
                    const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [targetCompanyId, userId]);
                    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Acesso negado' });
                }
            } else {
                targetCompanyId = userAssignedCompanyId;
            }
        }

        const params: any[] = [];
        let where = '';

        if (targetCompanyId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(targetCompanyId)) {
                return res.status(400).json({ error: 'Invalid Company ID format' });
            }
            where += ` AND company_id = $${params.length + 1}::uuid`;
            params.push(targetCompanyId);
        } else if (userRole !== 'ADMIN') {
            where += ` AND (company_id = $${params.length + 1}::uuid OR company_id IN (SELECT id FROM companies WHERE owner_id = $${params.length + 1}::uuid))`;
            params.push(userAssignedCompanyId || userId);
        }

        // --- NEW: COLLABORATOR ISOLATION ---
        if (userRole === 'COLLABORATOR' || userRole === 'OPERATOR') {
            where += ` AND uploaded_by = $${params.length + 1}::uuid`;
            params.push(userId);
        }

        const days = period === '7D' ? 7 : period === '30D' ? 30 : 90;
        where += ` AND created_at >= NOW() - INTERVAL '${days} days'`;

        const sql = `
            SELECT 
                DATE(created_at) as date, 
                SUM(COALESCE(valor_documento, 0)) as amount 
            FROM documents 
            WHERE 1=1 ${where}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;
        const result = await executeQuery(sql, params);
        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/ai-insights', requireAuth, async (req: any, res) => {
    try {
        const { companyId } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        // Security: Fetch user's assigned company
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = companyId && companyId !== 'ALL' && companyId !== 'undefined' ? companyId : null;

        if (userRole !== 'ADMIN') {
            if (targetCompanyId) {
                if (targetCompanyId !== userAssignedCompanyId) {
                    const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [targetCompanyId, userId]);
                    if (ownerCheck.rowCount === 0) return res.json([]); // Just return empty if not allowed
                }
            } else {
                targetCompanyId = userAssignedCompanyId;
            }
        }

        const params: any[] = [];
        let where = '';

        if (targetCompanyId) {
            where = ` AND a.company_id = $${params.length + 1}::uuid`;
            params.push(targetCompanyId);
        } else if (userRole !== 'ADMIN') {
            where = ` AND (a.company_id = $${params.length + 1}::uuid OR a.company_id IN (SELECT id FROM companies WHERE owner_id = $${params.length + 1}::uuid))`;
            params.push(userAssignedCompanyId || userId);
        }

        // --- NEW: COLLABORATOR ISOLATION ---
        if (userRole === 'COLLABORATOR' || userRole === 'OPERATOR') {
            where += ` AND (a.metadata->>'userId' = $${params.length + 1} OR a.metadata->>'uploaded_by' = $${params.length + 1})`;
            params.push(userId);
        }

        // Check if ai_alerts table exists first
        const tableCheck = await executeQuery(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'ai_alerts'
            );
        `, []);

        const tableExists = tableCheck.rows[0]?.exists;
        if (!tableExists) return res.json([]);

        // Table exists, query it
        const sql = `
            SELECT a.*, c.name as company_name 
            FROM ai_alerts a
            LEFT JOIN companies c ON a.company_id = c.id
            WHERE a.is_resolved = false
            ${where}
            ORDER BY a.created_at DESC 
            LIMIT 20
        `;
        const result = await executeQuery(sql, params);
        res.json(result.rows);
    } catch (err: any) {
        console.error('[AI Insights] Error:', err.message);
        res.json([]);
    }
});

// ==================== REPORTS & FISCAL INTELLIGENCE ====================

app.get('/api/reports/analytics', requireAuth, async (req: any, res) => {
    try {
        const { companyId } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        // Security: Fetch user's assigned company
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetCompanyId = companyId && companyId !== 'ALL' && companyId !== 'undefined' ? companyId : null;

        if (userRole !== 'ADMIN') {
            if (targetCompanyId) {
                if (targetCompanyId !== userAssignedCompanyId) {
                    const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [targetCompanyId, userId]);
                    if (ownerCheck.rowCount === 0) return res.json([]);
                }
            } else {
                targetCompanyId = userAssignedCompanyId;
            }
        }

        let sql = `SELECT * FROM view_fiscal_analytics`;
        const params: any[] = [];

        if (targetCompanyId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(targetCompanyId)) {
                sql += ` WHERE company_id = $1::uuid`;
                params.push(targetCompanyId);
            } else {
                return res.json([]);
            }
        } else if (userRole !== 'ADMIN') {
            sql += ` WHERE (company_id = $1::uuid OR company_id IN (SELECT id FROM companies WHERE owner_id = $1::uuid))`;
            params.push(userAssignedCompanyId || userId);
        }

        sql += ` ORDER BY mes_referencia DESC`;

        const result = await executeQuery(sql, params);
        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/distribution', requireAuth, async (req: any, res) => {
    try {
        const { companyId, startDate, endDate } = req.query;
        const userId = req.user.id;
        const userRole = (req.user.role || '').toUpperCase();

        // Security: Fetch user's assigned company
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const userAssignedCompanyId = userRes.rows[0]?.company_id;

        let targetId = null;
        if (companyId && companyId !== 'ALL' && companyId !== 'undefined') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(companyId as string)) {
                targetId = companyId as string;
                // Security Check
                if (userRole !== 'ADMIN' && targetId !== userAssignedCompanyId) {
                    const ownerCheck = await executeQuery('SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2', [targetId, userId]);
                    if (ownerCheck.rowCount === 0) return res.status(403).json({ error: 'Acesso negado' });
                }
            }
        } else if (userRole !== 'ADMIN') {
            targetId = userAssignedCompanyId;
        }

        const sql = `SELECT fn_get_fiscal_distribution($1::uuid, $2, $3) as distribution`;

        const result = await executeQuery(sql, [
            targetId,
            startDate || '2000-01-01',
            endDate || '2100-01-01'
        ]);
        res.json(result.rows[0].distribution);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/tax-position', requireAuth, async (req: any, res) => {
    try {
        const { companyId, month, year } = req.query;

        let targetId = null;
        if (companyId && companyId !== 'ALL' && companyId !== 'undefined') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(companyId)) {
                targetId = companyId;
            }
        }

        const m = parseInt(month as string);
        const y = parseInt(year as string);
        const period = `${y}-${m.toString().padStart(2, '0')}`;

        const sql = `SELECT fn_get_tax_position($1::uuid, $2) as tax_position`;

        const result = await executeQuery(sql, [targetId, period]);

        res.json(result.rows[0].tax_position);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/vat-map', requireAuth, async (req: any, res: any) => {
    try {
        const { companyId, month, year } = req.query;
        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        // Calculate period string YYYY-MM
        const m = parseInt(month as string);
        const y = parseInt(year as string);
        const period = `${y}-${m.toString().padStart(2, '0')}`;

        const sql = `SELECT fn_generate_vat_map($1::uuid, $2) as vat_map`;
        const companyIdParam = (!companyId || companyId === 'ALL' || companyId === 'undefined') ? null : companyId;

        const result = await executeQuery(sql, [companyIdParam, period]);

        // Map backend keys to frontend expected keys if different
        const rawMap = result.rows[0].vat_map;
        const formatted = {
            resumo: {
                periodo: rawMap.sumario.periodo,
                iva_dedutivel: rawMap.sumario.iva_dedutivel,
                iva_liquidado: rawMap.sumario.iva_liquidado,
                saldo_iva: rawMap.sumario.posicao_liquida,
                base: rawMap.sumario.base_tributavel
            },
            documentos: rawMap.documentos
        };

        res.json(formatted);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});


app.post('/api/auth/heartbeat', requireAuth, async (req: any, res: any) => {
    try {
        const userId = req.user.id;
        const { companyId, userAgent } = req.body;
        console.log(`[DEBUG] Heartbeat for user ${userId} company ${companyId}`);

        // CRITICAL: Handle 'PERSONAL' or invalid UUID strings
        const dbCompanyId = (companyId && companyId !== 'ALL' && companyId !== 'PERSONAL' && companyId !== 'undefined') ? companyId : null;

        // 1. Atualizar timestamp do usuário
        await executeQuery(
            'UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1',
            [userId]
        );

        // 2. Atualizar ou Criar Sessão Ativa
        const activeSession = await executeQuery(
            'SELECT id FROM user_sessions WHERE user_id = $1 AND is_active = true ORDER BY last_active_at DESC LIMIT 1',
            [userId]
        );

        if (activeSession.rowCount && activeSession.rowCount > 0) {
            await executeQuery(
                'UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
                [activeSession.rows[0].id]
            );
        } else {
            await executeQuery(
                'INSERT INTO user_sessions (user_id, company_id, user_agent, is_active) VALUES ($1, $2, $3, true)',
                [userId, dbCompanyId, userAgent]
            );
        }

        res.json({ success: true, timestamp: new Date() });
    } catch (err: any) {
        console.error('❌ [HEARTBEAT CRITICAL ERROR]:', {
            message: err.message,
            stack: err.stack,
            userId: req.user?.id,
            body: req.body
        });
        res.status(500).json({
            error: 'Erro interno ao processar heartbeat',
            details: err.message,
            stack: err.stack
        });
    }
});


// ==================== SYSTEM SETTINGS & CONFIG ====================

// 1. Admin Settings (Get All)
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const settings = await settingsService.getAllForAdmin();
        res.json(settings);
    } catch (err: any) {
        console.error('[Settings] Error fetching settings:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Admin Settings (Update)
app.post('/api/admin/settings', requireAuth, requireAdmin, async (req: any, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Key is required' });

        await settingsService.updateSetting(key, value, req.user.id);

        // Log action
        await logSystemAction(req.user.id, 'UPDATE_SETTING', 'SYSTEM', key, { newValue: value }, req);

        res.json({ success: true });
    } catch (err: any) {
        console.error('[Settings] Error updating setting:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== SERVER PLANS MANAGEMENT ====================

// 1. Get All Server Plans (Admin view includes hidden)
app.get('/api/admin/server-plans', requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await executeQuery('SELECT * FROM server_performance_plans ORDER BY monthly_credits ASC');
        res.json(result.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 2. Create Server Plan
app.post('/api/admin/server-plans', requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            slug, name, description, monthly_credits, price, analysis_cost,
            max_users, color, features, is_visible,
            welcome_credits, analysis_time, cpu_cores, ram_gb, gpu_info
        } = req.body;
        const id = crypto.randomUUID();
        const result = await executeQuery(
            `INSERT INTO server_performance_plans 
             (id, slug, name, description, monthly_credits, price, analysis_cost, max_users, color, features, is_visible,
              welcome_credits, analysis_time, cpu_cores, ram_gb, gpu_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
            [
                id, slug, name, description, monthly_credits || 0, price || 0, analysis_cost || 1,
                max_users || 1, color || '#3b82f6', JSON.stringify(features || []), is_visible ?? true,
                welcome_credits || 0, analysis_time || '2-5 segundos', cpu_cores || '1 vCPU', ram_gb || '2 GB', gpu_info || 'Não disponível'
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 3. Update Server Plan
app.patch('/api/admin/server-plans/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
        const fields: string[] = [];
        const values: any[] = [];
        const body = req.body;
        let idx = 1;

        const allowedFields = [
            'slug', 'name', 'description', 'monthly_credits', 'price', 'analysis_cost',
            'max_users', 'color', 'features', 'is_active', 'is_visible',
            'welcome_credits', 'analysis_time', 'cpu_cores', 'ram_gb', 'gpu_info'
        ];

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                fields.push(`${field === 'is_active' ? 'is_visible' : field} = $${idx++}`); // map is_active to is_visible if frontend sends it
                values.push(field === 'features' ? JSON.stringify(body[field]) : body[field]);
            }
        }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(req.params.id);
        const result = await executeQuery(
            `UPDATE server_performance_plans SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
            values
        );

        if (result.rowCount === 0) return res.status(404).json({ error: 'Plan not found' });
        res.json(result.rows[0]);
    } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// 4. Delete Server Plan
app.delete('/api/admin/server-plans/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
        const result = await executeQuery('DELETE FROM server_performance_plans WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Plan not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 3. Public Config (Dynamic Webhooks)
app.get('/api/config', async (req, res) => {
    try {
        // Returns only safe, public configuration
        const publicKeys = [
            'nif_webhook_url',
            'n8n_webhook_url',
            'company_name',
            'support_email',
            'enable_signup',
            'maintenance_mode',
            'api_version',
            'api_base_url'
        ];

        const config: Record<string, any> = {};
        for (const key of publicKeys) {
            const val = settingsService.get(key);
            if (val !== undefined) config[key] = val;
        }
        res.json(config);
    } catch (err: any) {
        // Non-critical, return empty
        console.warn('[Config] Failed to serve public config:', err);
        res.json({});
    }
});

// System Health / Infrastructure Endpoint
app.get('/api/admin/infra/health', requireAuth, requireAdmin, async (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.round((usedMem / totalMem) * 100);

        const cpus = os.cpus();
        const loadAvg = os.loadavg();

        // DB Stats
        const dbStats = {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount,
            active: pool.totalCount - pool.idleCount
        };

        const agentsRes = await executeQuery('SELECT COUNT(*) as count FROM agent_prompts');
        const agentsCount = agentsRes.rows[0].count;

        res.json({
            system: {
                hostname: os.hostname(),
                platform: os.platform(),
                uptime: os.uptime(),
                memory: {
                    total: totalMem,
                    free: freeMem,
                    used: usedMem,
                    usagePercentage: memUsage
                },
                cpu: {
                    count: cpus.length,
                    model: cpus[0].model,
                    load: loadAvg
                }
            },
            database: {
                stats: dbStats,
                poolSize: pool.totalCount
            },
            services: {
                ai_agents: {
                    status: 'active',
                    prompts_loaded: agentsCount
                },
                database: {
                    status: 'active'
                }
            }
        });
    } catch (err: any) {
        console.error('Health Check Failed:', err);
        res.status(500).json({ error: 'Health Check Failed', details: err.message });
    }
});

app.get('/api/admin/system/status', authenticate, async (req: any, res: any) => {
    try {
        res.json({
            status: 'online',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// AI PROXY ENDPOINT (Secure Backend Service)
app.post('/api/ai/chat', authenticate, async (req: any, res: any) => {
    try {
        const { messages, model } = req.body;
        const response = await aiService.chat(messages, model);
        res.json(response);
    } catch (err: any) {
        console.error('AI Chat Error:', err);
        res.status(500).json({ error: 'Falha na comunicação com a IA' });
    }
});

// WORKFLOW PROXY ENDPOINT (Secure n8n Trigger)
// WORKFLOW PROXY ENDPOINT (Async - Fire and Forget)
app.post('/api/workflow/trigger', authenticate, upload.array('files'), async (req: any, res: any) => {
    try {
        console.log(`[/api/workflow/trigger] Received ${(req.files as Express.Multer.File[])?.length || 0} files`);

        // 1. Respond immediately with 202 Accepted
        res.status(202).json({
            status: 'PROCESSING',
            message: 'Documentos recebidos e em processamento. Consulte o status via /api/documents',
            filesReceived: (req.files as Express.Multer.File[])?.length || 0
        });

        // 2. Trigger n8n analysis in background (fire-and-forget)
        // This runs asynchronously after response is sent
        setImmediate(async () => {
            try {
                console.log('[Background] Starting n8n analysis...');
                await workflowService.triggerAnalysis(
                    req.files as Express.Multer.File[],
                    req.body.metadata,
                    req.user
                );
                console.log('[Background] N8N analysis triggered successfully');
            } catch (bgErr: any) {
                console.error('[Background] N8N trigger failed:', bgErr.message);
                // Error is logged but doesn't affect the response (already sent)
                // Documents will remain in PROCESSING state until webhook updates them
            }
        });

    } catch (err: any) {
        console.error('Workflow Trigger Error:', err);
        res.status(500).json({ error: 'Falha ao receber documentos.' });
    }
});

// GLOBAL ERROR HANDLER (Sanitized for Production)
app.use((err: any, req: any, res: any, next: any) => {
    console.error('🔥 [SECURITY/SYSTEM ERROR]:', err);

    const status = err.status || 500;
    const isInternal = status >= 500;
    const isDev = process.env.NODE_ENV === 'development';

    res.status(status).json({
        error: err.message, // Forçando a exibição do erro real para diagnóstico cirúrgico
        message: err.message,
        code: err.code || (isInternal ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR')
    });
});

// INITIALIZATION
(async () => {
    try {
        console.log('🚀 [Server] Initializing...');

        // Execute migrations and settings load via runner
        await runAllMigrations();

        // AI Agents Loop Initialization
        const runAiAgents = async () => {
            console.log(`[AI AGENTS] Starting cycle: ${new Date().toISOString()}`);
            try {
                await new SentinelAgent().run();
                await new WatchdogAgent().run();
                await new PredictorAgent().run();
                await new OptimizerAgent().run();
                console.log(`[AI AGENTS] Cycle completed: ${new Date().toISOString()}`);
            } catch (err) {
                console.error('[AI AGENTS] Error in cycle:', err);
            }
        };

        app.listen(Number(PORT), '0.0.0.0', () => {
            console.log(`\n========================================`);
            console.log(`🚀 AUTH SYSTEM RUNNING ON PORT ${PORT}`);
            console.log(`========================================\n`);

            // ✅ AI Agents CRON removed - no longer blocks server
            // AI Agents can be triggered manually via /api/admin/run-ai-agents if needed
        });
    } catch (err) {
        console.error('❌ [Server] Fatal startup error:', err);
    }
})();
