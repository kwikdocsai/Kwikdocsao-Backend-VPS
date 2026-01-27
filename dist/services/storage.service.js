import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { pool } from "../database/postgres.client.js";
export class StorageService {
    client = null;
    bucket = '';
    tenantId = '';
    lastConfigTime = 0;
    configCacheDuration = 60000; // 1 minute cache
    constructor() {
        // Initialize from environment variables first
        this.initializeFromEnv();
    }
    initializeFromEnv() {
        const accessKey = process.env.S3_ACCESS_KEY || '';
        const rawBucket = process.env.S3_BUCKET || 'kwikdocsao';
        this.bucket = rawBucket;
        this.tenantId = process.env.S3_TENANT_ID || accessKey || '';
        this.client = new S3Client({
            endpoint: process.env.S3_ENDPOINT || 'https://usc1.contabostorage.com',
            region: process.env.S3_REGION || 'usc1',
            credentials: {
                accessKeyId: accessKey,
                secretAccessKey: process.env.S3_SECRET_KEY || '',
            },
            forcePathStyle: true,
        });
        this.lastConfigTime = Date.now();
    }
    async getClient() {
        const now = Date.now();
        // If we have a client and it's less than 1 minute old, reuse it
        if (this.client && (now - this.lastConfigTime < this.configCacheDuration)) {
            return { client: this.client, bucket: this.bucket, tenantId: this.tenantId };
        }
        try {
            // Attempt to load active config from DB
            const res = await pool.query('SELECT * FROM storage_settings WHERE is_active = true LIMIT 1');
            if (res.rows.length > 0) {
                const config = res.rows[0];
                this.bucket = config.bucket;
                this.tenantId = config.tenant_id || config.access_key;
                this.client = new S3Client({
                    endpoint: config.endpoint,
                    region: config.region,
                    credentials: {
                        accessKeyId: config.access_key,
                        secretAccessKey: config.secret_key,
                    },
                    forcePathStyle: true,
                });
                this.lastConfigTime = now;
                console.log('[StorageService] Loaded dynamic configuration from DB');
            }
            else if (!this.client) {
                this.initializeFromEnv();
            }
        }
        catch (e) {
            console.error('[StorageService] Error loading DB config, using default/env:', e);
            if (!this.client)
                this.initializeFromEnv();
        }
        return { client: this.client, bucket: this.bucket, tenantId: this.tenantId };
    }
    async uploadFile(file, fileName, mimeType, companyId, companyName, category = 'other-documents') {
        try {
            const { client, bucket, tenantId } = await this.getClient();
            const timestamp = Date.now();
            const uuid = crypto.randomUUID();
            const extension = fileName.split('.').pop();
            const safeFileName = `${uuid}_${timestamp}.${extension}`;
            const sanitizedName = companyName
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .toLowerCase();
            const companyFolder = `${companyId}-${sanitizedName}`;
            const key = `companies/${companyFolder}/${category}/${safeFileName}`;
            console.log(`[StorageService] Uploading ${fileName} to ${key} (Bucket: ${bucket})...`);
            const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: file,
                ContentType: mimeType,
                ACL: 'public-read'
            });
            await client.send(command);
            const config = await client.config.endpoint();
            const endpointUrl = `${config.protocol}//${config.hostname}`;
            let fileUrl = '';
            // Contabo Style: endpoint/tenant:bucket/key
            if (endpointUrl.includes('contabo')) {
                const bucketWithPrefix = `${tenantId}:${bucket}`;
                fileUrl = `${endpointUrl}/${bucketWithPrefix}/${key}`;
            }
            else {
                // S3 Standard Path Style: endpoint/bucket/key
                fileUrl = `${endpointUrl}/${bucket}/${key}`;
            }
            return { url: fileUrl, path: key, bucket: bucket };
        }
        catch (error) {
            console.error('[StorageService] Upload Error:', error.message);
            throw new Error(`Falha no upload para o storage: ${error.message}`);
        }
    }
    async forceReload() {
        this.lastConfigTime = 0;
        await this.getClient();
    }
    getCategoryByType(type) {
        const t = (type || 'UNKNOWN').toUpperCase();
        if (t.includes('INVOICE') || t.includes('FATURA'))
            return 'invoices';
        if (t.includes('RECEIPT') || t.includes('RECIBO'))
            return 'receipts';
        return 'other-documents';
    }
}
export const storageService = new StorageService();
