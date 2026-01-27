import { pool } from '../database/postgres.client.js';
export class PredictorAgent {
    agentName = 'Predictor';
    async run() {
        console.log(`[${this.agentName}] Starting analysis...`);
        const client = await pool.connect();
        try {
            // 1. Fetch Aggregated Data per Company per Month (Last 6 Months)
            // We need to cast jsonb fields to numeric
            const query = `
                WITH monthly_stats AS (
                    SELECT 
                        company_id,
                        DATE_TRUNC('month', created_at) as month,
                        SUM(COALESCE((data->>'totalAmount')::numeric, 0)) as total_spend
                    FROM documents
                    WHERE created_at >= NOW() - INTERVAL '6 months'
                    GROUP BY company_id, DATE_TRUNC('month', created_at)
                    ORDER BY company_id, month ASC
                )
                SELECT company_id, json_agg(json_build_object('month', month, 'total', total_spend)) as history
                FROM monthly_stats
                GROUP BY company_id
            `;
            const res = await client.query(query);
            console.log(`[${this.agentName}] Analyzing data for ${res.rowCount} companies...`);
            for (const company of res.rows) {
                await this.analyzeCompany(client, company);
            }
        }
        catch (err) {
            console.error(`[${this.agentName}] Error:`, err);
        }
        finally {
            client.release();
            console.log(`[${this.agentName}] Analysis finished.`);
        }
    }
    async analyzeCompany(client, companyObj) {
        const { company_id, history } = companyObj;
        if (!history || history.length < 2) {
            console.log(`[${this.agentName}] Not enough data for company ${company_id}`);
            return;
        }
        // 2. Calculate Metrics
        // history is array of { month, total }
        const totals = history.map((h) => parseFloat(h.total));
        const avgMonthly = totals.reduce((a, b) => a + b, 0) / totals.length;
        // Simple Linear Growth Rate extraction (Last vs First / N) or Month-over-Month avg
        // Let's use weighted recent trend: Compare Last Month to Avg.
        const lastMonthTotal = totals[totals.length - 1];
        // Forecast: If growing, assume growth continues. If shrinking, flatten or shrink.
        // Simple: Forecast = Last Month
        // Complex (User requested 4o logic): "Identify growth/decline".
        let trend = 'STABLE';
        if (lastMonthTotal > avgMonthly * 1.1)
            trend = 'GROWTH';
        else if (lastMonthTotal < avgMonthly * 0.9)
            trend = 'DECLINE';
        // Est. Next Month Spend
        const forecastSpend = trend === 'GROWTH' ? lastMonthTotal * 1.05 :
            trend === 'DECLINE' ? lastMonthTotal * 0.95 : lastMonthTotal;
        // Est. VAT (Assuming standard 14% on expenses for reclaim credit OR tax liability if these were sales)
        // User context: "Previsão de desembolso para impostos". 
        // If these are "purchases" (expenses), high spend = high input VAT (credit).
        // If these are "sales", high sales = high output VAT (liability).
        // "Documents" usually implies invoices received (expenses) in typical OCR contexts, 
        // BUT "Prever impostos a pagar" implies output VAT (Sales).
        // However, user said: "considerando 14% sobre as despesas processadas como crédito fiscal".
        // Wait. "Previsão de desembolso para impostos" normally means "Standard VAT - Input VAT".
        // If we only have expenses, we are predicting the CREDIT side.
        // User prompt: "SE a previsão de desembolso... for 20% maior". 
        // This is confusing if we strictly only scan expenses.
        // Hypothesis: User wants to know if the CREDIT potential is high? 
        // OR user implies these documents might be SALES?
        // Let's stick to the literal math requested:
        // "Estime o valor de IVA a pagar no próximo mês (considerando 14% sobre as despesas processadas como crédito fiscal)."
        // This phrasing is tricky. "IVA a pagar" usually means (SalesTax - ExpenseTax).
        // If we only have expenses, we calculate "Potencial Crédito".
        // BUT, maybe the "Previsão de desembolso" refers to the *savings* or just the absolute VAT amount involved.
        // Let's interpret "Previsão de Impostos Elevada" as "High Tax Impact".
        // If the prompt says "payment of VAT (desembolso)", it implies these might be sales documents or the user wants to estimate liability based on expenses (which is inverse).
        // Let's assume for this agent, we calculate 14% of the Forecast Spend and call it "Estimated VAT Impact".
        // If the prompt explicitly says "Previsão de desembolso (payment)", and we see huge expenses, maybe it means we have huge INPUT tax to deduct.
        // Actually, later "Optimizer" suggests "economy".
        // Let's implement the ALERT condition: "Forecast VAT > Historical Avg VAT * 1.2".
        const estVatNextMonth = forecastSpend * 0.14;
        const avgVatHistory = avgMonthly * 0.14;
        if (estVatNextMonth > avgVatHistory * 1.2) {
            await this.createAlert(client, {
                company_id,
                severity: 'WARNING',
                title: 'Previsão de Impostos Elevada',
                message: `Com base no fluxo atual, estima-se um volume de IVA de Kz ${estVatNextMonth.toLocaleString('pt-AO', { maximumFractionDigits: 2 })} para o próximo ciclo (Cred. Fiscal).`,
                metadata: {
                    trend,
                    avg_monthly_spend: avgMonthly,
                    last_month_spend: lastMonthTotal,
                    forecast_spend: forecastSpend,
                    growth_factor: estVatNextMonth / avgVatHistory
                }
            });
        }
    }
    async createAlert(client, alert) {
        // Check duplication (Prevent Alert spam for same month/week?)
        // We will assert unique by company + agent + title + resolved=false
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
