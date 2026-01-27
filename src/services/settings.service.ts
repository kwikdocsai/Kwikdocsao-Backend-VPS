import { executeQuery } from '../database/postgres.client.js';

export class SettingsService {
    async getAll() {
        const result = await executeQuery(`SELECT * FROM system_settings ORDER BY key`);
        return result.rows;
    }

    async get(key: string) {
        const result = await executeQuery(`SELECT value FROM system_settings WHERE key = $1`, [key]);
        return result.rows[0]?.value;
    }

    async set(key: string, value: string, description?: string) {
        const result = await executeQuery(`
            INSERT INTO system_settings (key, value, description, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [key, value, description]);
        return result.rows[0];
    }

    async delete(key: string) {
        await executeQuery(`DELETE FROM system_settings WHERE key = $1`, [key]);
        return { deleted: true };
    }
}

export const settingsService = new SettingsService();
