import { executeQuery } from '../database/postgres.client.js';
export const runUpdateCreditPackagesMigration = async () => {
    try {
        console.log('Running Migration 57: Updating Credit Packages...');
        const commonFeatures = [
            "8 Agentes de IA",
            "Validação AGT Tempo Real",
            "OCR Neural Ilimitado",
            "Arquivo Digital Seguro",
            "Exportação SAFT & Excel",
            "Créditos nunca expiram"
        ];
        const packages = [
            {
                name: 'Starter',
                credits: 150,
                price: 75000,
                bonus: 15,
                features: ["150 Créditos + 15 Bônus", ...commonFeatures]
            },
            {
                name: 'Pro Business',
                credits: 350,
                price: 150000,
                bonus: 30,
                features: ["350 Créditos + 30 Bônus", ...commonFeatures, "Suporte Prioritário", "API de Integração"]
            },
            {
                name: 'Enterprise',
                credits: 600,
                price: 250000,
                bonus: 50,
                features: ["600 Créditos + 50 Bônus", ...commonFeatures, "Gestor de Conta", "SLA Garantido"]
            }
        ];
        // Ensure packages exist or update them
        for (const pkg of packages) {
            // Try update first
            const updateRes = await executeQuery(`UPDATE credit_packages
                 SET credits = $1, price = $2, bonus_credits = $3, features = $4::jsonb, is_active = true
                 WHERE name = $5 RETURNING id`, [pkg.credits, pkg.price, pkg.bonus, JSON.stringify(pkg.features), pkg.name]);
            if (updateRes.rowCount === 0) {
                // Insert if not exists
                await executeQuery(`INSERT INTO credit_packages (name, credits, price, bonus_credits, features, description, is_active)
                     VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)`, [pkg.name, pkg.credits, pkg.price, pkg.bonus, JSON.stringify(pkg.features), `Pacote ${pkg.name} com benefícios premium.`]);
            }
        }
        // Cleanup: Remove any other packages not in our list
        await executeQuery(`DELETE FROM credit_packages WHERE name NOT IN ($1, $2, $3)`, ['Starter', 'Pro Business', 'Enterprise']);
        console.log('Migration 57 completed (Cleaned up duplicates).');
    }
    catch (err) {
        console.error('Migration 57 failed:', err.message);
    }
};
