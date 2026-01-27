import { pool } from '../database/postgres.client.js';

export class WatchdogAgent {
    private agentName = 'Watchdog';

    async run() {
        console.log(`[${this.agentName}] Starting compliance check...`);
        const client = await pool.connect();
        try {
            // 1. Fetch COMPLETED documents for Current Month
            const query = `
                SELECT id, company_id, file_name, data, created_at 
                FROM documents 
                WHERE status = 'COMPLETED'
                -- AND created_at >= DATE_TRUNC('month', CURRENT_DATE) -- Uncomment for production (Current Month)
                -- For testing, we remove the date filter to match the sample data we have (Jan 2026)
                AND created_at >= '2026-01-01'
            `;

            const res = await client.query(query);
            console.log(`[${this.agentName}] Auditing ${res.rowCount} documents...`);

            const companyIssues: Record<string, { missing_fields: string[], duplicates: string[] }> = {};

            // Helper to init company issue object
            const getCompanyIssue = (id: string) => {
                if (!companyIssues[id]) companyIssues[id] = { missing_fields: [], duplicates: [] };
                return companyIssues[id];
            };

            // 2. Local Validation (Missing Fields)
            // We also prepare a structure for Duplicate Checking
            const docSignatures: Record<string, string[]> = {}; // "nif|amount|date" -> [docId1, docId2...]

            for (const doc of res.rows) {
                const { id, company_id, file_name, data } = doc;
                const issues = getCompanyIssue(company_id);

                // Map fields safely
                const invoiceNo = data.invoiceNo || data.invoice_no || data.number || data.faturaNo;
                const issuerNif = data.issuer_data?.nif || data.issuer?.nif || data.nif_emitente;
                const docDate = data.date || data.invoiceDate || data.data_emissao;
                const totalAmount = data.totalAmount || data.total || '0';

                // Check Missing
                const missing: string[] = [];
                if (!invoiceNo) missing.push('Número da Fatura');
                if (!issuerNif) missing.push('NIF Emitente');
                if (!docDate) missing.push('Data Emissão');

                if (missing.length > 0) {
                    issues.missing_fields.push(id);
                }

                // Prepare Duplicate Check
                // Key: NIF + Amount + Date (normalized)
                if (issuerNif && totalAmount && docDate) {
                    const key = `${issuerNif}|${parseFloat(totalAmount)}|${docDate}`;
                    if (!docSignatures[key]) docSignatures[key] = [];
                    docSignatures[key].push(id);
                }
            }

            // 3. Identify Duplicates
            for (const key in docSignatures) {
                const ids = docSignatures[key];
                if (ids.length > 1) {
                    // We need to find which company these belong to (assuming duplicates usually within same company)
                    // For simplicity, we assume we can look up the company from the first ID in our local list or map.
                    // Let's just iterate and add to their respective company issues.
                    for (const id of ids) {
                        const doc = res.rows.find((r: any) => r.id === id);
                        if (doc) {
                            getCompanyIssue(doc.company_id).duplicates.push(id);
                        }
                    }
                }
            }

            // 4. Generate Alerts per Company
            for (const companyId in companyIssues) {
                const issues = companyIssues[companyId];
                const missingCount = issues.missing_fields.length;
                // Duplicates count is listing all involved docs. 
                // We should probably list unique "groups" or just list the docs involved.
                // Or just "N documents involved in duplication".

                // Deduplicate IDs in the lists (a doc could be both missing fields AND duplicate, technically, though less likely for NIF/Date check)
                const problemDocs = new Set([...issues.missing_fields, ...issues.duplicates]);
                const totalErrors = problemDocs.size;

                if (totalErrors > 0) {
                    await this.createAlert(client, {
                        company_id: companyId,
                        severity: 'INFO',
                        title: 'Pendente de Compliance SAFT',
                        message: `Identificamos ${totalErrors} documentos que precisam de correção para evitar erros na exportação mensal.`,
                        metadata: {
                            missing_fields_count: missingCount,
                            duplicates_count: issues.duplicates.length,
                            problematic_document_ids: Array.from(problemDocs)
                        }
                    });
                }
            }

        } catch (err) {
            console.error(`[${this.agentName}] Error:`, err);
        } finally {
            client.release();
            console.log(`[${this.agentName}] Compliance check finished.`);
        }
    }

    private async createAlert(client: any, alert: any) {
        // Check if similar alert exists explicitly for this agent/title/company
        const checkQuery = `
            SELECT id FROM ai_alerts 
            WHERE company_id = $1 
            AND agent_name = $2 
            AND title = $3
            AND is_resolved = false
        `;
        const existing = await client.query(checkQuery, [alert.company_id, this.agentName, alert.title]);

        if (existing.rowCount === 0) {
            const insertQuery = `
                INSERT INTO ai_alerts (company_id, agent_name, severity, title, message, metadata)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            await client.query(insertQuery, [
                alert.company_id,
                this.agentName,
                alert.severity,
                alert.title,
                alert.message,
                alert.metadata
            ]);
            console.log(`[${this.agentName}] Alert created for company ${alert.company_id}`);
        }
    }
}

// Auto-run

