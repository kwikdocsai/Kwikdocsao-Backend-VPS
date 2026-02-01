import { verifyToken, UserPayload } from '../utils/token.js';

export function authenticate(token?: string): UserPayload {
    if (!token) {
        throw new Error('Authentication token required');
    }

    const payload = verifyToken(token);
    if (!payload) {
        throw new Error('Invalid or expired token');
    }

    return payload;
}

export function authorize(user: UserPayload, allowedRoles: string[]) {
    if (!allowedRoles.includes(user.role)) {
        throw new Error('Access denied: Insufficient permissions');
    }
}

export function checkPermissions(userPermissions: any, tool: string) {
    if (!userPermissions) return true; // Default behavior
    return userPermissions[tool] === true;
}

/**
 * Validates if the user has access to the requested company.
 * Strict IDOR protection for Multi-Tenancy.
 */
export async function validateCompanyAccess(user: UserPayload, targetCompanyId: string | null | undefined): Promise<boolean> {
    if (!user) return false;

    // 1. Super Admin bypass
    if (user.role.toUpperCase() === 'SUPER_ADMIN') return true;

    // 2. Global context or no target specified
    if (!targetCompanyId || targetCompanyId === 'ALL') return true;

    // 3. Direct membership check (Owners/Employees)
    if (String(user.companyId) === String(targetCompanyId)) return true;

    // 4. Accountant/Admin managing multiple entities
    // Even if they are not "members" of the company, they might be the 'owner' in the companies table
    try {
        const { executeQuery } = await import('../database/postgres.client.js');
        const checkRes = await executeQuery(
            'SELECT id FROM companies WHERE id = $1 AND owner_id = $2',
            [targetCompanyId, user.id]
        );
        return !!(checkRes.rowCount && checkRes.rowCount > 0);
    } catch (err) {
        console.error('[validateCompanyAccess] DB check failed:', err);
        return false;
    }
}
