import { executeQuery } from '../database/postgres.client.js';
import * as crypto from 'crypto';
// Use a fixed key from ENV or fallback (DANGEROUS Fallback for DEV ONLY)
// In production, CONFIG_ENCRYPTION_KEY must be set.
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 chars
const IV_LENGTH = 16;
const IS_PROD = process.env.NODE_ENV === 'production';
export class SettingsService {
    cache = {};
    lastCacheUpdate = 0;
    CACHE_TTL = 60000; // 1 minute
    constructor() {
        if (IS_PROD && !process.env.CONFIG_ENCRYPTION_KEY) {
            console.error('❌ FATAL SECURITY ERROR: CONFIG_ENCRYPTION_KEY environment variable is missing in PRODUCTION!');
            process.exit(1);
        }
        this.loadCache();
    }
    encrypt(text) {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }
    decrypt(text) {
        try {
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        }
        catch (e) {
            console.error('Decryption failed', e);
            return '***DECRYPTION_ERROR***';
        }
    }
    async loadCache() {
        try {
            const res = await executeQuery('SELECT * FROM system_settings');
            const newCache = {};
            for (const row of res.rows) {
                // Decrypt secrets for internal usage
                let val = row.value;
                if (row.is_secret && val) {
                    // Check if it looks encrypted (has colon and hex)
                    if (val.includes(':')) {
                        val = this.decrypt(val);
                    }
                    // Else, it might be plain text from seed/migration, we should fix it on next save
                }
                // Parse Type
                if (row.type === 'number')
                    val = Number(val);
                if (row.type === 'boolean')
                    val = val === 'true';
                if (row.type === 'json')
                    val = JSON.parse(val || '{}');
                newCache[row.key] = val;
            }
            this.cache = newCache;
            this.lastCacheUpdate = Date.now();
            console.log('[SettingsService] Cache reloaded.');
        }
        catch (e) {
            console.error('Failed to load settings cache:', e);
        }
    }
    // Get a setting for INTERNAL usage (decrypted)
    get(key) {
        // If critical key missing or cache stale, validation logic could go here
        return this.cache[key];
    }
    // Get all settings for ADMIN UI (secrets masked)
    async getAllForAdmin() {
        const res = await executeQuery('SELECT * FROM system_settings ORDER BY group_name, key');
        console.log('[SettingsService] Raw DB rows:', res.rows.length);
        console.log('[SettingsService] First row:', JSON.stringify(res.rows[0]));
        return res.rows.map(row => {
            let val = row.value;
            // Mask secrets
            if (row.is_secret) {
                val = ''; // Don't send secret back to UI. Or send '******'
            }
            else {
                // Parse types for UI
                if (row.type === 'number')
                    val = Number(val);
                if (row.type === 'boolean')
                    val = val === 'true';
                if (row.type === 'json')
                    val = JSON.parse(val || '{}');
            }
            return {
                key: row.key,
                value: val,
                type: row.type,
                group_name: row.group_name,
                is_secret: row.is_secret,
                description: row.description,
                updated_at: row.updated_at,
                updated_by: row.updated_by
            };
        });
    }
    async updateSetting(key, value, userId) {
        console.log(`[SettingsService] Updating key: '${key}' by user ${userId}`);
        // Fetch current definition
        const currentRes = await executeQuery('SELECT * FROM system_settings WHERE key = $1', [key]);
        if (currentRes.rowCount === 0) {
            console.warn(`[SettingsService] Key '${key}' not found in DB.`);
            throw new Error(`Configuração '${key}' não encontrada no sistema. Contacte o suporte.`);
        }
        const meta = currentRes.rows[0];
        let dbValue = String(value);
        if (meta.is_secret) {
            // Check if value is provided. If empty/null, we DO NOT update (keep existing)
            // UI should send null/empty string if not changing.
            if (!value || value === '')
                return; // Skip update
            // Encrypt new value
            dbValue = this.encrypt(dbValue);
        }
        await executeQuery(`UPDATE system_settings 
             SET value = $1, updated_at = NOW(), updated_by = $2
             WHERE key = $3`, [dbValue, userId, key]);
        // Audit Log (handled by server logSystemAction call, or here)
        // Here we just invalidate cache
        await this.loadCache();
        return { success: true };
    }
}
export const settingsService = new SettingsService();
// Initialize cache immediately
// settingsService.loadCache();
