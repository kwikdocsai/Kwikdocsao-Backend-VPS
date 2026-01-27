import { executeQuery } from '../database/postgres.client.js';
export class TransactionsService {
    async create(userId, planName, amount, currency = 'AOA') {
        const result = await executeQuery(`INSERT INTO transactions (user_id, plan_name, amount, currency, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING *`, [userId, planName, amount, currency]);
        return result.rows[0];
    }
    async findByUser(userId) {
        const result = await executeQuery(`SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
        return result.rows;
    }
    async findAll(status) {
        let query = `SELECT t.*, u.name as user_name, u.email as user_email 
                     FROM transactions t 
                     LEFT JOIN users u ON t.user_id = u.id 
                     ORDER BY t.created_at DESC`;
        if (status) {
            query = query.replace('ORDER BY', `WHERE t.status = '${status}' ORDER BY`);
        }
        const result = await executeQuery(query);
        return result.rows;
    }
    async updateStatus(id, status, proofUrl) {
        const result = await executeQuery(`UPDATE transactions SET status = $1, proof_url = $2, processed_at = CURRENT_TIMESTAMP
             WHERE id = $3 RETURNING *`, [status, proofUrl, id]);
        return result.rows[0];
    }
}
export const transactionsService = new TransactionsService();
