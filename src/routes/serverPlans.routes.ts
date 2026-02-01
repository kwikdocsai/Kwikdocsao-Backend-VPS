import express from 'express';
import {
    getPublicServerPlans,
    getAllServerPlans,
    createServerPlan,
    updateServerPlan,
    deleteServerPlan
} from '../services/serverPlans.service.js';
import { authenticate } from '../auth/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/server-plans/public
 * Public endpoint to fetch visible server plans for landing page
 * No authentication required
 */
router.get('/public', async (req, res) => {
    try {
        const plans = await getPublicServerPlans();
        res.json({
            success: true,
            data: plans
        });
    } catch (error: any) {
        console.error('Error in /api/server-plans/public:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch server plans',
            message: error.message
        });
    }
});

// Middleware for authentication
const requireAuth = (req: any, res: any, next: any) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new Error('No token');
        req.user = authenticate(token);
        next();
    } catch (err: any) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

const requireSuperAdmin = (req: any, res: any, next: any) => {
    const role = (req.user?.role || '').toUpperCase();
    if (role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin required' });
    }
    next();
};

/**
 * GET /api/server-plans/ (Authenticated users)
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const plans = await getAllServerPlans();
        res.json(plans);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/server-plans/subscription?companyId=xxx
 * Get active subscription details for a company
 */
router.get('/subscription', requireAuth, async (req, res) => {
    try {
        const { companyId } = req.query;
        if (!companyId) {
            return res.status(400).json({ error: 'companyId is required' });
        }

        const { executeQuery } = await import('../database/postgres.client.js');
        const result = await executeQuery(
            `SELECT spp.max_users, spp.name, spp.analysis_cost, ss.status
             FROM server_subscriptions ss
             JOIN server_performance_plans spp ON ss.server_type = spp.slug
             WHERE ss.company_id = $1 AND ss.status = 'ACTIVE'
             ORDER BY ss.created_at DESC LIMIT 1`,
            [companyId]
        );

        if (result.rowCount === 0) {
            return res.json({ max_users: 1, name: 'FREE', analysis_cost: 1, status: 'INACTIVE' });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/server-plans/ (ADMIN ONLY)
 */
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const plan = await createServerPlan(req.body);
        res.status(201).json(plan);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/server-plans/:id (ADMIN ONLY)
 */
router.patch('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const plan = await updateServerPlan(req.params.id, req.body);
        res.json(plan);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/server-plans/:id (ADMIN ONLY)
 */
router.delete('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        await deleteServerPlan(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
