import { executeQuery } from '../database/postgres.client.js';
export class AuditService {
    async log(userId, action, resourceType, resourceId, details, ipAddress) {
        const result = await executeQuery(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [userId, action, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress]);
        return result.rows[0];
    }
    async findByUser(userId, limit = 100) {
        const result = await executeQuery(`SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
        return result.rows;
    }
    async findAll(limit = 100, offset = 0) {
        const result = await executeQuery(`
            SELECT a.*, u.name as user_name, u.email as user_email
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC LIMIT $1 OFFSET $2
        `, [limit, offset]);
        return result.rows;
    }
    async findByAction(action, limit = 100) {
        const result = await executeQuery(`SELECT * FROM audit_logs WHERE action ILIKE $1 ORDER BY created_at DESC LIMIT $2`, [`%${action}%`, limit]);
        return result.rows;
    }
}
export const auditService = new AuditService();
