import { executeQuery } from '../database/postgres.client.js';
export class TeamService {
    async invite(ownerId, memberEmail, memberName, role = 'viewer') {
        const result = await executeQuery(`INSERT INTO team_members (owner_id, member_email, member_name, role, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING *`, [ownerId, memberEmail, memberName, role]);
        return result.rows[0];
    }
    async findByOwner(ownerId) {
        const result = await executeQuery(`SELECT * FROM team_members WHERE owner_id = $1 ORDER BY invited_at DESC`, [ownerId]);
        return result.rows;
    }
    async updateRole(id, role) {
        const result = await executeQuery(`UPDATE team_members SET role = $1 WHERE id = $2 RETURNING *`, [role, id]);
        return result.rows[0];
    }
    async accept(id) {
        const result = await executeQuery(`UPDATE team_members SET status = 'active', accepted_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`, [id]);
        return result.rows[0];
    }
    async remove(id) {
        await executeQuery(`DELETE FROM team_members WHERE id = $1`, [id]);
        return { removed: true };
    }
}
export const teamService = new TeamService();
