
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Use absolute path for .env
const envPath = 'c:/PROJECTOS 2026/DEV-Kwikdocs/dev-final-kwikdocsai-v1.0/auth-system/.env';
dotenv.config({ path: envPath });

console.log('DATABASE_URL from env:', process.env.DATABASE_URL ? 'FOUND' : 'NOT FOUND');

async function debugDocs() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('Connected successfully');

        const result = await client.query(`
      SELECT id, file_name, status, responsible_user_id, resolution_notes, 
             data->'sugestoes_correcao' as suggestion,
             data->'merchantName' as merchant,
             data->'nif' as nif,
             data->'state' as state
      FROM documents 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

        console.log('Recent Documents:');
        console.log(JSON.stringify(result.rows, null, 2));

        const statuses = await client.query(`
      SELECT status, COUNT(*) 
      FROM documents 
      GROUP BY status
    `);
        console.log('\nStatus Statistics:');
        console.table(statuses.rows);

    } catch (err: any) {
        console.error('CRITICAL ERROR:', err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        await client.end().catch(() => { });
    }
}

debugDocs();
