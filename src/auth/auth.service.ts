import { executeQuery, pool } from '../database/postgres.client.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken, UserPayload } from '../utils/token.js';
import { settingsService } from '../admin/settings.service.js';

// Credits per plan
// Credits per plan
const PLAN_CREDITS: Record<string, number> = {
    'free': 10,
    'pro': 100,
    'enterprise': 500
};

export class AuthService {
    async register(name: string, email: string, password: string, role: string = 'ACCOUNTANT', companyId: string | null = null, ownerId: string | null = null, mustChangePassword: boolean = false) {
        // ENFORCED COMPLEXITY VALIDATION
        if (!password) {
            throw new Error('A senha é obrigatória.');
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            throw new Error('A senha deve ter pelo menos 8 caracteres, incluindo letra maiúscula, minúscula, número e caractere especial.');
        }

        // Check for duplicate email
        const existing = await executeQuery('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rowCount && existing.rowCount > 0) {
            throw new Error('Email already registered');
        }

        // Hash password before storing
        const hashedPassword = await hashPassword(password);

        // Resolve default credits from settings
        const defaultCredits = settingsService.get('initial_signup_credits') || 15;

        // INSERT into users (simplified schema)
        const result = await executeQuery(
            `INSERT INTO users (name, email, password, role, company_id, owner_id, permissions, status, force_password_change, credits) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9) 
             RETURNING id, name, email, role, company_id, owner_id, permissions, status, created_at, force_password_change, credits`,
            [name, email, hashedPassword, role, companyId, ownerId, JSON.stringify({
                finance: true, legal: true, lgt: true, payments: true, risk: true,
                analytics: true, reports: true, accounting: true, inventory: true, admin: true,
                canUpload: true, canExport: true, canDelete: true
            }), mustChangePassword, defaultCredits]
        );

        return result.rows[0];
    }

    async login(email: string, password: string) {
        const result = await executeQuery(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (!result.rowCount || result.rowCount === 0) {
            throw new Error('Invalid credentials');
        }

        const user = result.rows[0];

        if (user.status !== 'ACTIVE') {
            throw new Error('Account is deactivated');
        }

        // Hash compare only
        const isPasswordValid = await comparePassword(password, user.password || '');

        if (!isPasswordValid) {
            throw new Error('Invalid credentials');
        }

        const payload: UserPayload = { id: user.id, email: user.email, role: user.role, companyId: user.company_id };
        const token = generateToken(payload);

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                companyId: user.company_id,
                permissions: user.permissions,
                status: user.status,
                avatarUrl: user.avatar_url,
                credits: user.credits,
                force_password_change: user.force_password_change,
                auditor_prompt: user.auditor_prompt,
                strategist_prompt: user.strategist_prompt,
                rag_prompt: user.rag_prompt,
                analyzer_prompt: user.analyzer_prompt,
                vision_prompt: user.vision_prompt
            },
            token
        };
    }

    async getCredits(userId: string) {
        // Find user and their owner
        const userRes = await executeQuery('SELECT id, credits, plan, owner_id, permissions, usage_limits FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];

        if (!user) return { credits: 0, plan: 'free' };

        // If subordinate, return owner's credits
        if (user.owner_id) {
            const ownerRes = await executeQuery('SELECT credits, plan FROM users WHERE id = $1', [user.owner_id]);
            return ownerRes.rows[0] || { credits: 0, plan: 'free' };
        }

        return {
            credits: user.credits,
            plan: user.plan,
            permissions: user.permissions,
            usageLimits: user.usage_limits
        };
    }

    async getTeam(adminId: string, companyIdFilter?: string) {
        // Fetch company_id and role for the requesting user
        const adminRes = await executeQuery('SELECT company_id, role FROM users WHERE id = $1', [adminId]);
        const admin = adminRes.rows[0];
        const userRole = (admin?.role || '').toUpperCase();

        let targetCompanyId = admin?.company_id;

        // If requester is ADMIN or ACCOUNTANT and a filter is provided, use it
        if ((userRole === 'ADMIN' || userRole === 'ACCOUNTANT') && companyIdFilter && companyIdFilter !== 'ALL') {
            targetCompanyId = companyIdFilter;
        }

        if (!targetCompanyId) {
            console.warn(`[DEBUG] getTeam: No targetCompanyId found for requester: ${adminId}`);
            return [];
        }

        const result = await executeQuery(
            `SELECT id, name, email, role, plan, credits, status,
            last_login, permissions, usage_limits, company_id 
            FROM users WHERE company_id = $1
            ORDER BY created_at DESC`,
            [targetCompanyId]
        );
        console.log(`[DEBUG] getTeam: Database returned ${result.rows.length} users for company: ${targetCompanyId}`);
        return result.rows;
    }

    async updatePermissions(subordinateId: string, permissions: any, usageLimits: any, role?: string) {
        const query = role
            ? 'UPDATE users SET permissions = $1, usage_limits = $2, role = $4, updated_at = now() WHERE id = $3 RETURNING id, permissions, usage_limits, role'
            : 'UPDATE users SET permissions = $1, usage_limits = $2, updated_at = now() WHERE id = $3 RETURNING id, permissions, usage_limits, role';

        const params = role
            ? [JSON.stringify(permissions), JSON.stringify(usageLimits), subordinateId, role]
            : [JSON.stringify(permissions), JSON.stringify(usageLimits), subordinateId];

        const result = await executeQuery(query, params);
        return result.rows[0];
    }

    async getTeamStats(adminId: string, companyIdFilter?: string) {
        // Fetch company_id and role for the requesting user
        const adminRes = await executeQuery('SELECT company_id, role FROM users WHERE id = $1', [adminId]);
        const admin = adminRes.rows[0];
        const userRole = (admin?.role || '').toUpperCase();

        let targetCompanyId = admin?.company_id;

        // If requester is ADMIN or ACCOUNTANT and a filter is provided, use it
        if ((userRole === 'ADMIN' || userRole === 'ACCOUNTANT') && companyIdFilter && companyIdFilter !== 'ALL') {
            targetCompanyId = companyIdFilter;
        }

        if (!targetCompanyId) return { total_members: 0, active_members: 0, limit: 10 };

        const stats = await executeQuery(
            `SELECT 
                COUNT(*) as total_members,
                COUNT(*) FILTER (WHERE is_active = true) as active_members
            FROM users WHERE company_id = $1`,
            [targetCompanyId]
        );

        // [FIX] Fetch Plan Limit (max_users) dynamically
        const planRes = await executeQuery(
            `SELECT spp.max_users 
             FROM server_performance_plans spp
             JOIN companies c ON c.plan_id = spp.id
             WHERE c.id = $1`,
            [targetCompanyId]
        );
        const maxUsers = planRes.rows[0]?.max_users || 10; // Default to 10 if plan not found

        return {
            total_members: parseInt(stats.rows[0]?.total_members || '0'),
            active_members: parseInt(stats.rows[0]?.active_members || '0'),
            limit: maxUsers
        };
    }

    async deleteUser(userId: string, adminId: string) {
        // Fetch requester role
        const adminRes = await executeQuery('SELECT role, company_id FROM users WHERE id = $1', [adminId]);
        const admin = adminRes.rows[0];
        const userRole = (admin?.role || '').toUpperCase();

        // Security check: only allow if user belongs to the same company as the admin OR admin is global ADMIN
        const checkRes = await executeQuery(
            `SELECT u1.company_id as target_company, u2.company_id as admin_company
             FROM users u1, users u2
             WHERE u1.id = $1 AND u2.id = $2`,
            [userId, adminId]
        );

        const { target_company, admin_company } = checkRes.rows[0] || {};

        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN' && (!target_company || target_company !== admin_company)) {
            throw new Error('Permissão negada ou usuário não pertence à sua organização.');
        }

        // Avoid deleting self
        if (userId === adminId) {
            throw new Error('Você não pode se auto-excluir.');
        }

        await executeQuery('DELETE FROM users WHERE id = $1', [userId]);
        return { success: true };
    }

    async getMemberUsage(userId: string) {
        // Table audit_logs deleted
        return [];
    }

    async consumeCredit(userId: string, amount: number = 1, tool: string = 'unknown', client: any = null) {
        const query = client ? (text: string, params: any[]) => client.query(text, params) : executeQuery;

        const userRes = await query('SELECT id, owner_id FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user) throw new Error('User not found');

        const walletOwnerId = userId; // [MODIFIED] Always deduct from personal wallet

        // Check balance (Lock row if in transaction to prevent race conditions? 'FOR UPDATE' might be good but let's stick to simple logic first)
        // If client is passed, we assume we are inside a transaction.
        const walletRes = await query(
            client
                ? 'SELECT credits, plan, owner_id FROM users WHERE id = $1 FOR UPDATE'
                : 'SELECT credits, plan, owner_id FROM users WHERE id = $1',
            [walletOwnerId]
        );

        const wallet = walletRes.rows[0];

        if (wallet.credits < amount) {
            throw new Error('Créditos pessoais insuficientes. Por favor, recarregue a sua conta.');
        }

        // Debit from the actual owner of the wallet
        await query('UPDATE users SET credits = credits - $1 WHERE id = $2', [amount, walletOwnerId]);

        // Audit the consumption
        await query(
            `INSERT INTO audit_logs (user_id, action, resource_type, details) 
             VALUES ($1, $2, $3, $4)`,
            [userId, 'consume_credit', tool, JSON.stringify({ amount, walletOwnerId })]
        );

        return { credits: wallet.credits - amount };
    }

    async transferCreditsToCompany(userId: string, companyId: string, amount: number) {
        if (amount <= 0) throw new Error('O valor da transferência deve ser superior a zero');

        const userRes = await executeQuery('SELECT credits FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user) throw new Error('Utilizador não encontrado');

        if (user.credits < amount) {
            throw new Error('Créditos pessoais insuficientes para esta transferência');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Deduct from user
            await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [amount, userId]);

            // Add to company
            await client.query('UPDATE companies SET credits = credits + $1 WHERE id = $2', [amount, companyId]);

            // Log as transaction for company
            const companyRes = await client.query('SELECT name FROM companies WHERE id = $1', [companyId]);
            const companyName = companyRes.rows[0]?.name || 'Empresa';

            await client.query(
                `INSERT INTO transactions (company_id, user_id, credits, type, description, amount, method, status)
                 VALUES ($1, $2, $3, 'PURCHASE', $4, 0, 'TRANSFER', 'COMPLETED')`,
                [companyId, userId, amount, `Transferência de Créditos Pessoais para ${companyName}`]
            );

            // Log as transaction for USER (Debit from personal wallet)
            await client.query(
                `INSERT INTO transactions (company_id, user_id, credits, type, description, amount, method, status)
                 VALUES (NULL, $1, $2, 'TRANSFER_OUT', $3, 0, 'TRANSFER', 'COMPLETED')`,
                [userId, amount, `Transferência para Empresa: ${companyName}`]
            );

            // Audit for user
            await client.query(
                `INSERT INTO audit_logs (user_id, action, resource_type, details) 
                 VALUES ($1, $2, $3, $4)`,
                [userId, 'transfer_credits', 'company', JSON.stringify({
                    amount,
                    companyId,
                    companyName,
                    source: 'personal_wallet',
                    target: companyName
                })]
            );

            await client.query('COMMIT');

            // Fetch final balances
            const userFinal = await executeQuery('SELECT credits FROM users WHERE id = $1', [userId]);
            const companyFinal = await executeQuery('SELECT credits FROM companies WHERE id = $1', [companyId]);

            return {
                success: true,
                userCredits: userFinal.rows[0].credits,
                companyCredits: companyFinal.rows[0].credits
            };
        } catch (err: any) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // ==================== TEAM INVITES ====================

    async createInvite(ownerId: string, email: string, name?: string) {
        // 1. Resolve companyId from owner
        const ownerRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [ownerId]);
        const companyId = ownerRes.rows[0]?.company_id;

        if (!companyId) throw new Error('Administrador sem empresa associada.');

        // 2. Fetch Plan Limit (max_users)
        const planRes = await executeQuery(
            `SELECT spp.max_users 
             FROM server_performance_plans spp
             JOIN companies c ON c.plan_id = spp.id
             WHERE c.id = $1`,
            [companyId]
        );

        const maxUsers = planRes.rows[0]?.max_users || 1;

        // 3. Count current active users + pending invites
        const currentRes = await executeQuery(
            `SELECT 
                (SELECT COUNT(*) FROM users WHERE company_id = $1) + 
                (SELECT COUNT(*) FROM team_invites WHERE owner_id = $2 AND status = 'PENDING') 
             as total`,
            [companyId, ownerId]
        );

        const currentCount = parseInt(currentRes.rows[0]?.total || '0');

        if (currentCount >= maxUsers) {
            throw new Error(`Limite de utilizadores atingido (${maxUsers}). Por favor, faça um upgrade ao seu servidor.`);
        }

        const result = await executeQuery(
            'INSERT INTO team_invites (owner_id, member_email, member_name) VALUES ($1, $2, $3) RETURNING id',
            [ownerId, email, name]
        );
        return result.rows[0].id;
    }


    async getInvites(ownerId: string) {
        const result = await executeQuery(
            'SELECT * FROM team_invites WHERE owner_id = $1 ORDER BY created_at DESC',
            [ownerId]
        );
        return result.rows;
    }

    // ==================== FINANCIAL OPERATIONS ====================

    async topupCredits(userId: string, amount: number) {
        await executeQuery(
            'UPDATE users SET credits = credits + $1, updated_at = now() WHERE id = $2',
            [amount, userId]
        );
        // Table credit_transactions deleted
        return { success: true };
    }

    async upgradePlan(userId: string, newPlan: string, creditsBonus: number) {
        const userRes = await executeQuery('SELECT plan FROM users WHERE id = $1', [userId]);
        const oldPlan = userRes.rows[0]?.plan;

        await executeQuery(
            'UPDATE users SET plan = $1, credits = credits + $2, updated_at = now() WHERE id = $3',
            [newPlan, creditsBonus, userId]
        );

        await executeQuery(
            'INSERT INTO credit_transactions (user_id, amount, type, plan_before, plan_after) VALUES ($1, $2, $3, $4, $5)',
            [userId, creditsBonus, 'upgrade', oldPlan, newPlan]
        );

        // Explicit log in transactions table for history visibility
        await executeQuery(
            `INSERT INTO transactions (user_id, company_id, type, amount, credits, status, description)
             VALUES ($1, NULL, 'PLAN_UPGRADE', 0, $2, 'COMPLETED', $3)`,
            [userId, creditsBonus, `Upgrade de Plano: ${oldPlan} -> ${newPlan} (+${creditsBonus} créditos)`]
        );

        return { success: true };
    }

    async setUserStatus(id: string, is_active: boolean) {
        return executeQuery(
            'UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2',
            [is_active, id]
        );
    }

    async changePassword(userId: string, newPassword: string) {
        const passwordHash = await hashPassword(newPassword);
        await executeQuery(
            'UPDATE users SET password = $1, must_change_password = false, force_password_change = false, updated_at = now() WHERE id = $2',
            [passwordHash, userId]
        );
        return { success: true };
    }

    // ==================== FATURIX MODULE ====================

    async saveFaturixAudit(userId: string, audit: any) {
        const result = await executeQuery(
            `INSERT INTO faturix_audits (
                user_id, file_name, doc_type, status, summary, 
                insights, causes, recommendations, fiscal_data, 
                visual_quality, fraud_analysis, raw_response
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [
                userId, audit.fileName, audit.docType, audit.status, audit.summary,
                JSON.stringify(audit.insights), JSON.stringify(audit.causes),
                JSON.stringify(audit.recommendations), JSON.stringify(audit.fiscalData),
                JSON.stringify(audit.visualQuality), JSON.stringify(audit.fraudAnalysis),
                JSON.stringify(audit.rawResponse)
            ]
        );
        return result.rows[0];
    }

    async getFaturixAudits(userId: string) {
        // Table deleted
        return [];
    }

    async getFaturixRules(userId: string) {
        // Retorna regras globais (sem user_id) ou específicas do usuário
        const result = await executeQuery(
            'SELECT * FROM faturix_rules WHERE user_id IS NULL OR user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    }

    async saveFaturixRule(userId: string, rule: any) {
        const result = await executeQuery(
            'INSERT INTO faturix_rules (user_id, name, category, description, rigor, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, rule.name, rule.category, rule.description, rule.rigor, rule.isActive]
        );
        return result.rows[0];
    }

    async toggleFaturixRule(ruleId: string, isActive: boolean) {
        await executeQuery('UPDATE faturix_rules SET is_active = $1 WHERE id = $2', [isActive, ruleId]);
    }

    async getFaturixAgentSettings(userId: string) {
        const result = await executeQuery(
            'SELECT * FROM faturix_agent_settings WHERE user_id = $1',
            [userId]
        );
        return result.rows[0] || { agent_instructions: '', visual_instructions: '', decision_criteria: '' };
    }

    async saveFaturixAgentSettings(userId: string, instructions: string, visualInstructions: string, criteria: string) {
        const existing = await this.getFaturixAgentSettings(userId);
        if (existing.id) {
            await executeQuery(
                'UPDATE faturix_agent_settings SET agent_instructions = $1, visual_instructions = $2, decision_criteria = $3, updated_at = now() WHERE user_id = $4',
                [instructions, visualInstructions, criteria, userId]
            );
        } else {
            await executeQuery(
                'INSERT INTO faturix_agent_settings (user_id, agent_instructions, visual_instructions, decision_criteria) VALUES ($1, $2, $3, $4)',
                [userId, instructions, visualInstructions, criteria]
            );
        }
        return { success: true };
    }

    async getFaturixStats(userId: string, companyId?: string, month?: number, year?: number) {
        let docParams: any[] = [userId];
        let whereDocs = `(uploaded_by = $1 OR company_id IN (SELECT id FROM companies WHERE owner_id = $1))`;

        if (companyId && companyId !== 'ALL' && companyId !== 'undefined') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(companyId)) {
                whereDocs = `company_id = $1::uuid`;
                docParams = [companyId];
            }
        }

        // Apply Date Filter
        if (month && year) {
            whereDocs += ` AND EXTRACT(MONTH FROM created_at) = ${month} AND EXTRACT(YEAR FROM created_at) = ${year}`;
        }

        // 1. Audit Stats (STUBBED - Table Deleted)
        const total = 0;
        const approved = 0;
        const approvedManual = 0;
        const integrity = '100.0';

        // 2. Logs (STUBBED - Table Deleted)
        const logs: any[] = [];

        // 4. Financials (FROM documents - ACTIVE)
        const financialsRes = await executeQuery(
            `SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimento = 'ENTRADA' THEN valor_documento ELSE 0 END), 0) as total_sales,
                COALESCE(SUM(CASE WHEN tipo_movimento = 'SAIDA' THEN valor_documento ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(CASE WHEN tipo_movimento = 'ENTRADA' THEN valor_iva ELSE 0 END), 0) as vat_payable,
                COALESCE(SUM(CASE WHEN tipo_movimento = 'SAIDA' THEN valor_iva ELSE 0 END), 0) as vat_deductible,
                COALESCE(SUM(valor_retencao), 0) as total_retention,
                COALESCE(COUNT(*) FILTER (WHERE status_fiscal = 'ALERTA' OR fiscal_status = 'ALERTA' OR compliance_level = 'ALTO'), 0) as total_alerts
             FROM documents
             WHERE ${whereDocs}`,
            docParams
        );

        // 5. Risks (STUBBED - Table Deleted)
        const top_risks: any[] = [];

        // 6. Chart Data (FROM documents - ACTIVE)
        const chartRes = await executeQuery(
            `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*) as count
             FROM documents
             WHERE ${whereDocs} AND created_at > now() - interval '7 days'
             GROUP BY date
             ORDER BY date ASC`,
            docParams
        );

        // 7. Categories (FROM documents - ACTIVE)
        const typeRes = await executeQuery(
            `SELECT type as doc_type, COUNT(*) as count FROM documents WHERE ${whereDocs} GROUP BY type`,
            docParams
        );

        let categories = {
            'Tax & Compliance': 0,
            'Legal Archives': 0,
            'Supply Chain': 0
        };

        typeRes.rows.forEach((row: any) => {
            const type = (row.doc_type || '').toLowerCase();
            if (type.includes('contrato') || type.includes('juridico')) {
                categories['Legal Archives'] += parseInt(row.count);
            } else if (type.includes('guia') || type.includes('transporte') || type.includes('ordem')) {
                categories['Supply Chain'] += parseInt(row.count);
            } else {
                categories['Tax & Compliance'] += parseInt(row.count);
            }
        });

        return {
            total_docs: total,
            approved_count: approved,
            approved_manual_count: approvedManual,
            rejected_count: 0,
            review_count: 0,
            integrity: `${integrity}%`,
            chart_data: chartRes.rows,
            category_counts: categories,
            total_sales: parseFloat(financialsRes.rows[0].total_sales || '0'),
            total_expenses: parseFloat(financialsRes.rows[0].total_expenses || '0'),
            vat_payable: parseFloat(financialsRes.rows[0].vat_payable || '0'),
            vat_deductible: parseFloat(financialsRes.rows[0].vat_deductible || '0'),
            total_retention: parseFloat(financialsRes.rows[0].total_retention || '0'),
            total_value: parseFloat(financialsRes.rows[0].total_sales || '0') + parseFloat(financialsRes.rows[0].total_expenses || '0'),
            total_alerts: parseInt(financialsRes.rows[0].total_alerts || '0'),
            top_risks: top_risks,
            logs: []
        };
    }

    async updateFaturixAuditStatus(auditId: string, status: string, source: string = 'manual') {
        // Table deleted
    }

    async initializeFaturixAudit(userId: string, fileName: string, docType: string, companyId?: string) {
        // Table deleted
        return { id: 'STUB' };
    }

    async completeFaturixAudit(auditId: string, auditData: any) {
        // Table deleted
        console.log(`[AUDIT_SKIP] Table faturix_audits deleted. Skipping completion for ${auditId}`);
    }

    async getFiscalEntities(userId: string, companyId?: string) {
        const params: any[] = [];
        let query = 'SELECT * FROM fiscal_entities';

        if (companyId && companyId !== 'ALL') {
            query += ' WHERE company_id = $1';
            params.push(companyId);
        } else {
            query += ' WHERE user_id = $1';
            params.push(userId);
        }

        query += ' ORDER BY last_seen_at DESC';
        const result = await executeQuery(query, params);
        return result.rows;
    }
    async generateSaft(companyId: string, month: number, year: number) {
        // Validation
        if (!companyId) throw new Error('Company ID required');

        // Fetch Company Data
        const companyRes = await executeQuery('SELECT * FROM companies WHERE id = $1', [companyId]);
        const company = companyRes.rows[0];
        if (!company) throw new Error('Company not found');

        // Fetch Documents for Period
        const period = `${year}-${month.toString().padStart(2, '0')}`;
        const docsRes = await executeQuery(
            `SELECT * FROM documents 
             WHERE company_id = $1 
             AND TO_CHAR(created_at, 'YYYY-MM') = $2
             AND (status LIKE 'APROVADO%' OR status = 'COMPLETED')`,
            [companyId, period]
        );
        const docs = docsRes.rows;

        // XML Construction (Simplified for MVP/Compliance Check)
        const header = `<?xml version="1.0" encoding="Windows-1252" standalone="yes"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
    <Header>
        <AuditFileVersion>1.01_01</AuditFileVersion>
        <CompanyID>${company.nif || 'N/A'}</CompanyID>
        <TaxRegistrationNumber>${company.nif || 'N/A'}</TaxRegistrationNumber>
        <TaxAccountingBasis>F</TaxAccountingBasis>
        <CompanyName>${company.name || 'Empresa'}</CompanyName>
        <BusinessName>${company.name || 'Empresa'}</BusinessName>
        <CompanyAddress>
            <AddressDetail>${company.address || 'Luanda'}</AddressDetail>
            <City>Luanda</City>
            <Country>AO</Country>
        </CompanyAddress>
        <FiscalYear>${year}</FiscalYear>
        <StartDate>${year}-${month.toString().padStart(2, '0')}-01</StartDate>
        <EndDate>${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate()}</EndDate>
        <CurrencyCode>AOA</CurrencyCode>
        <DateCreated>${new Date().toISOString().split('T')[0]}</DateCreated>
        <TaxEntity>Global</TaxEntity>
        <ProductCompanyTaxID>5417088289</ProductCompanyTaxID>
        <SoftwareValidationNumber>425/AGT/2026</SoftwareValidationNumber>
        <ProductID>KwikDocs/Faturix</ProductID>
        <ProductVersion>1.0.0</ProductVersion>
    </Header>
    <SourceDocuments>
        <SalesInvoices>
            <NumberOfEntries>${docs.filter(d => d.tipo_movimento === 'ENTRADA').length}</NumberOfEntries>
            <TotalDebit>0.00</TotalDebit>
            <TotalCredit>${docs.reduce((acc: number, d: any) => acc + parseFloat(d.valor_documento || 0), 0).toFixed(2)}</TotalCredit>
        </SalesInvoices>
        <!-- Movement of Goods -->
        <MovementOfGoods>
             <NumberOfMovementLines>${docs.filter(d => d.type === 'GUIA_TRANSPORTE').length}</NumberOfMovementLines>
             <TotalQuantityIssued>0.00</TotalQuantityIssued>
        </MovementOfGoods>
    </SourceDocuments>
</AuditFile>`;

        return {
            fileName: `SAFT_AO_${period}_${company.nif || 'EXPORT'}.xml`,
            content: header
        };
    }

    async listUsers() {
        const result = await executeQuery(
            `SELECT id, name, email, role, status, created_at, last_login, company_id 
             FROM users 
             ORDER BY created_at DESC`,
            []
        );
        return result.rows;
    }

    async deactivateUser(id: string) {
        await executeQuery(
            'UPDATE users SET status = $1, updated_at = now() WHERE id = $2',
            ['DEACTIVATED', id]
        );
        return { success: true };
    }
}

export const authService = new AuthService();
