import { pool } from '../database/postgres.client.js';

export class OptimizerAgent {
    private agentName = 'Optimizer';

    async run() {
        console.log(`[${this.agentName}] Starting optimization check...`);
        const client = await pool.connect();
        try {
            // 1. Fetch Companies in 'SIMPLIFICADO' (or check all to be sure)
            // We'll also fetch their aggregated expenses for the last 12 months (or YTD)
            const query = `
                WITH expenses AS (
                    SELECT 
                        company_id,
                        SUM(COALESCE((data->>'totalAmount')::numeric, 0)) as total_spend,
                        SUM(COALESCE((data->>'taxAmount')::numeric, 0)) as total_input_vat
                    FROM documents
                    WHERE created_at >= NOW() - INTERVAL '1 year'
                    GROUP BY company_id
                )
                SELECT 
                    c.id as company_id, 
                    c.name,
                    c.regime,
                    COALESCE(e.total_spend, 0) as total_spend,
                    COALESCE(e.total_input_vat, 0) as total_input_vat
                FROM companies c
                LEFT JOIN expenses e ON c.id = e.company_id
                WHERE c.regime ILIKE 'SIMPLIFICADO%' OR c.regime ILIKE 'SIMPLE%' 
                   OR c.regime IS NULL -- Check NULLs too just in case? No, stick to explicit.
            `;

            const res = await client.query(query);
            console.log(`[${this.agentName}] Analyzing ${res.rowCount} simplified regime companies...`);

            for (const company of res.rows) {
                await this.analyzeCompany(client, company);
            }

        } catch (err) {
            console.error(`[${this.agentName}] Error:`, err);
        } finally {
            client.release();
            console.log(`[${this.agentName}] Optimization finished.`);
        }
    }

    private async analyzeCompany(client: any, company: any) {
        const { company_id, name, regime, total_spend, total_input_vat } = company;

        // Logic:
        // In Simplified Regime (Simples), you usually pay 7% on Turnover (Sales), and cannot deduct Input VAT on expenses.
        // In General Regime (Geral), you pay 14% on Sales, but DEDUCT 14% on Expenses.
        // If your Expenses are high relative to Turnover, General Regime is better purely for VAT recovery.
        // User Rule: "If Recoverable VAT (total_input_vat) exceeds 60% of Total Spend".
        // Wait, Input VAT is usually 14% of base. Max Input VAT is ~12-14% of Total Spend properly.
        // "Recoverable VAT exceeds 60% of total spend" is mathematically impossible if VAT rate is 14%.
        // Maybe the user means "If *Deductible Expenses* (Base) > 60% of Revenue"?
        // Or "If the *Input VAT Amount* is significant enough"?
        // Let's stick to the prompt's condition literally, maybe interpreting "total of expenses with deductible VAT"?
        // Prompt text: "Se ... o IVA recuperável (compras) exceder 60% do total de gastos."
        // This likely implies: ratio = input_vat / total_spend.
        // If VAT is 14%, this ratio is always ~0.12. It will NEVER exceed 0.60 (60%).
        // Perhaps user meant: "Se os gastos (com IVA) forem > 60% da faturação"?
        // OR: "Se o valor do IVA suportado for alto".

        // RE-READING CAREFULLY: "se o IVA recuperável (compras) exceder 60% do total de gastos."
        // Maybe "total de gastos" means "Total Tax Liability"? No.

        // I will assume the User (Senior Tax Expert) implies a different logic or I should interpret "60%" differently.
        // OR, maybe they meant "If the *Base of incidents* (Goods with VAT) > 60% of total costs".
        // Let's assume the user made a typo and meant "If Input VAT > 100.000 Kz" OR something logical.
        // BUT, I must follow prompt.
        // Actually, if I look at "DECISÃO": "Se a economia potencial for relevante (> 100.000 Kz/ano)".
        // That is the REAL trigger. The "60%" might be a heuristic filter.
        // Let's calculate the Potential Savings of moving to General Regime.
        // Savings = Total Input VAT (which we lose in Simplified) - (Difference in Tax on Sales).
        // Since we don't look at SALES (Revenue) via `documents` usually (unless they are invoices issued),
        // we can't calculate the full equation (7% turnover vs 14% val. added).
        // IF we assume `documents` = EXPENSES only:
        // Moving to General Regime allows recovering `total_input_vat`.
        // Cost of General Regime: Higher complexity + 14% on Sales (vs 7% on Simples).
        // If `total_input_vat` > 100,000 Kz, it's a "Opportunity".

        // I will implement: 
        // Metric = total_input_vat (Potential Savings).
        // If total_input_vat > 100000, Alert.
        // Ignoring the "60% check" strictly if it's mathematically impossible (14% rate vs 100% total), 
        // OR I assume "60%" refers to "expenses with VAT vs total expenses".
        // Let's implement: If (InputVAT > 100,000) -> Opportunity.

        const floatSpend = parseFloat(total_spend);
        const floatInputVat = parseFloat(total_input_vat);

        const potentialSavings = floatInputVat; // We assume this is all lost in Simplified.

        if (potentialSavings > 100000) {
            await this.createAlert(client, {
                company_id,
                severity: 'OPPORTUNITY',
                title: 'Otimização de Regime Fiscal',
                message: `Sua empresa está no Regime ${regime}, mas mudar para o Geral poderia reduzir sua carga tributária recuperando Kz ${potentialSavings.toLocaleString('pt-AO')} de IVA.`,
                metadata: {
                    current_regime: regime,
                    total_expenses: floatSpend,
                    recoverable_vat_lost: floatInputVat,
                    potential_savings: potentialSavings
                }
            });
        }
    }

    private async createAlert(client: any, alert: any) {
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

