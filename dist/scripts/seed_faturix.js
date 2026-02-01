import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
// Load env from current directory or parent
dotenv.config();
// Alternatively if .env is in root of auth-system and we run from there, this is fine.
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'kwikdocs_auth_db',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
});
const executeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        const res = await client.query(text, params);
        return res;
    }
    finally {
        client.release();
    }
};
async function seedFaturixData() {
    console.log('Seeding Faturix Data...');
    console.log(`Connecting to DB: ${process.env.DB_NAME} at ${process.env.DB_HOST}`);
    try {
        // 1. Get a Target User (Admin)
        const userRes = await executeQuery('SELECT id, company_id FROM users LIMIT 1');
        if (userRes.rowCount === 0) {
            console.error('No users found. Create a user first.');
            process.exit(1);
        }
        const user = userRes.rows[0];
        const userId = user.id;
        // 2. Get/Set Company NIF
        let companyNif = '541000123'; // Default Test NIF
        const companyRes = await executeQuery('SELECT nif FROM companies WHERE id = $1', [user.company_id]);
        if (companyRes.rows[0]?.nif) {
            companyNif = companyRes.rows[0].nif;
        }
        else {
            // Update company with test NIF if missing
            await executeQuery('UPDATE companies SET nif = $1 WHERE id = $2', [companyNif, user.company_id]);
            console.log(`Updated Company NIF to ${companyNif}`);
        }
        console.log(`Seeding data for User: ${userId} (Company NIF: ${companyNif})`);
        // 3. Generate Random Data
        const recordCount = 50;
        const today = new Date();
        for (let i = 0; i < recordCount; i++) {
            const isPurchase = Math.random() > 0.6; // 60% Sales, 40% Purchases
            const dateOffset = Math.floor(Math.random() * 30); // Last 30 days
            const docDate = new Date(today);
            docDate.setDate(today.getDate() - dateOffset);
            const dateStr = docDate.toISOString().split('T')[0];
            const amount = Math.floor(Math.random() * 50000) + 5000; // 5k to 55k
            const vatRate = 0.14;
            const vat = Math.floor(amount * vatRate);
            // NIF Logic:
            // If Sale (Entrada): Issuer = My Company
            // If Purchase (Saída): Issuer = Random NIF
            const issuerNif = !isPurchase ? companyNif : '999999999';
            // Alerts
            const alerts = [];
            if (Math.random() > 0.8)
                alerts.push('NIF do Adquirente não consta na base');
            if (Math.random() > 0.9)
                alerts.push('Data fora do período fiscal');
            if (Math.random() > 0.95)
                alerts.push('Possível duplicidade');
            const fiscalData = {
                issuer_data: { nif: issuerNif, name: !isPurchase ? 'Minha Empresa Lda' : 'Fornecedor Externo SA' },
                empresa_emitente: { nif: issuerNif }, // Add fallback
                resumo_para_dashboard: {
                    valor_documento: amount,
                    valor_iva: vat,
                    total_alertas: alerts.length
                },
                alertas_fiscais: alerts,
                date_issued: dateStr,
                valor_documento: amount, // Top level just in case
                valor_iva: vat
            };
            await executeQuery(`INSERT INTO faturix_audits (user_id, status, file_name, fiscal_data, created_at)
                 VALUES ($1, 'CONCLUIDO', $2, $3, $4)`, [
                userId,
                `Fat_${i}_${dateStr}.pdf`,
                JSON.stringify(fiscalData),
                docDate.toISOString() // Sets created_at for chart aggregation
            ]);
        }
        console.log(`Successfully seeded ${recordCount} records.`);
    }
    catch (err) {
        console.error('Seeding failed:', err);
    }
    finally {
        await pool.end();
    }
}
seedFaturixData();
