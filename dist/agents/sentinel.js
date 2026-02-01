import { pool } from '../database/postgres.client.js';
export class SentinelAgent {
    agentName = 'Sentinel';
    async run() {
        console.log(`[${this.agentName}] Starting routine check...`);
        const client = await pool.connect();
        try {
            // 1. Monitor: Fetch recent documents (last 24h or unprocessed/flagged?) 
            // For this routine, we'll check the last 50 processed docs to ensure integrity.
            // We could add a 'last_checked_at' column later, but for now we re-scan or scan unchecked.
            // Let's scan all 'COMPLETED' or 'ERROR' that don't have a resolved alert yet? 
            // Simpler: Scan recent 50.
            const query = `
                SELECT id, company_id, file_name, data, status 
                FROM documents 
                WHERE status IN ('COMPLETED', 'ERROR', 'REJEITADO', 'APROVADO')
                ORDER BY created_at DESC 
                LIMIT 50
            `;
            const res = await client.query(query);
            console.log(`[${this.agentName}] Inspecting ${res.rowCount} documents...`);
            for (const doc of res.rows) {
                await this.auditDocument(client, doc);
            }
        }
        catch (err) {
            console.error(`[${this.agentName}] Error:`, err);
        }
        finally {
            client.release();
            console.log(`[${this.agentName}] Routine finished.`);
        }
    }
    async auditDocument(client, doc) {
        const { id, file_name, data } = doc;
        const issues = [];
        let severity = 'INFO';
        if (!data)
            return;
        // --- CHECK 1: NIF Integrity ---
        const nif = data.issuer_data?.nif || data.issuer?.nif;
        const nifClean = nif ? String(nif).replace(/\D/g, '') : '';
        console.log(`[${this.agentName}] Doc ${id}: NIF='${nif}', Total=${data.totalAmount}, Tax=${data.total_tax}`);
        // AGT Rule: NIF must be 10 digits.
        if (!nifClean || nifClean.length !== 10) {
            issues.push(`NIF do Fornecedor inválido ou ausente: '${nif}'. Esperado 10 dígitos.`);
            severity = 'CRITICAL';
        }
        // --- CHECK 2: Tax Math (Total - Tax = Base) ---
        // Adapting to potential field names from OCR
        const totalAmount = parseFloat(data.totalAmount || data.total || '0');
        const taxAmount = parseFloat(data.taxAmount || data.total_tax || '0');
        // If taxableAmount is explicit, use it. Else assume (Total - Tax) should be close to Sum(Items.total) etc.
        // If we don't have taxableAmount explicit, we can't strictly verify the equation [Base + Tax = Total].
        // But we can check if Tax > Total (Logical error).
        if (taxAmount > totalAmount) {
            issues.push(`Inconsistência Fiscal: O valor do imposto (${taxAmount}) é superior ao total (${totalAmount}).`);
            severity = 'CRITICAL';
        }
        // If we extracted a 'taxableAmount' or 'subTotal', we can verify.
        const taxableAmount = parseFloat(data.taxableAmount || data.subTotal || data.net_amount || '0');
        if (taxableAmount > 0 && totalAmount > 0) {
            const calculatedBase = totalAmount - taxAmount;
            // Allow 1 Kz variance due to rounding
            if (Math.abs(calculatedBase - taxableAmount) > 1.0) {
                issues.push(`Erro de Cálculo: Base Tributável Declarada (${taxableAmount}) difere da calculada (${calculatedBase}).`);
                severity = 'WARNING'; // Warning because OCR might misread slight digits, not always CRITICAL fraud.
            }
        }
        // --- CHECK 3: Fraud Risk ---
        if (data.fraud_risk && (data.fraud_risk === 'HIGH' || data.fraud_risk === 'CRITICAL')) {
            issues.push(`Risco de Fraude Elevado identificado pelo motor de extração.`);
            severity = 'CRITICAL';
        }
        // --- REPORTING ---
        if (issues.length > 0) {
            await this.createAlert(client, {
                company_id: doc.company_id || '00000000-0000-0000-0000-000000000000', // Fallback if missing, but should exist
                title: 'Erro de Integridade Fiscal Detectado',
                message: `O documento '${file_name}' apresenta falhas: ${issues.join(' ')}`,
                metadata: {
                    document_id: id,
                    divergences: issues,
                    scanned_values: { totalAmount, taxAmount, taxableAmount, nif }
                },
                severity
            });
        }
    }
    async createAlert(client, alert) {
        // Retrieve company_id from document if possible, query doesn't select it above!
        // FIXED: Added company_id to SELECT query below logic.
        // Wait, I need company_id in the SELECT.
        // Check if alert already exists for this document to avoid spamming
        const checkQuery = `
            SELECT id FROM ai_alerts 
            WHERE metadata->>'document_id' = $1 
            AND agent_name = $2 
            AND is_resolved = false
        `;
        const existing = await client.query(checkQuery, [alert.metadata.document_id, this.agentName]);
        if (existing.rowCount === 0) {
            const insertQuery = `
                INSERT INTO ai_alerts (company_id, agent_name, severity, title, message, metadata)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            // Note: Use a valid UUID for company if doc doesn't have it.
            // I need to update the SELECT to include company_id.
            await client.query(insertQuery, [
                alert.company_id,
                this.agentName,
                alert.severity,
                alert.title,
                alert.message,
                alert.metadata
            ]);
            console.log(`[${this.agentName}] Alert created for doc ${alert.metadata.document_id}`);
        }
    }
}
// Auto-run
