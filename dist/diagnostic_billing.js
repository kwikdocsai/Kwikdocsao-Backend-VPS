import { executeQuery } from './database/postgres.client.js';
async function diagnoseBillingSystem() {
    console.log('🔍 DIAGNÓSTICO DO SISTEMA DE GESTÃO FINANCEIRA\n');
    console.log('='.repeat(60));
    try {
        // 1. Verificar Tabelas
        console.log('\n📊 1. VERIFICANDO EXISTÊNCIA DAS TABELAS...\n');
        const tables = ['plans', 'credit_packages', 'operational_costs', 'analysis_costs', 'financial_snapshots', 'transactions', 'companies'];
        for (const table of tables) {
            const result = await executeQuery(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )
            `, [table]);
            const exists = result.rows[0].exists;
            console.log(`  ${exists ? '✅' : '❌'} Tabela "${table}": ${exists ? 'EXISTE' : 'NÃO EXISTE'}`);
        }
        // 2. Verificar Dados nas Tabelas
        console.log('\n\n📈 2. VERIFICANDO DADOS NAS TABELAS...\n');
        // Plans
        const plansCount = await executeQuery('SELECT COUNT(*) as count FROM plans');
        console.log(`  📦 Plans: ${plansCount.rows[0].count} registros`);
        if (parseInt(plansCount.rows[0].count) > 0) {
            const plans = await executeQuery('SELECT id, name, price, is_active FROM plans LIMIT 5');
            console.log('     Exemplos:');
            plans.rows.forEach(p => console.log(`       - ${p.name}: Kz ${p.price} (${p.is_active ? 'Ativo' : 'Inativo'})`));
        }
        // Credit Packages
        const packagesCount = await executeQuery('SELECT COUNT(*) as count FROM credit_packages');
        console.log(`\n  💰 Credit Packages: ${packagesCount.rows[0].count} registros`);
        if (parseInt(packagesCount.rows[0].count) > 0) {
            const packages = await executeQuery('SELECT id, name, credits, price FROM credit_packages LIMIT 5');
            console.log('     Exemplos:');
            packages.rows.forEach(p => console.log(`       - ${p.name}: ${p.credits} créditos por Kz ${p.price}`));
        }
        // Operational Costs
        const costsCount = await executeQuery('SELECT COUNT(*) as count FROM operational_costs');
        console.log(`\n  💸 Operational Costs: ${costsCount.rows[0].count} registros`);
        if (parseInt(costsCount.rows[0].count) > 0) {
            const costs = await executeQuery('SELECT resource_type, cost_per_unit, unit_name FROM operational_costs LIMIT 5');
            console.log('     Exemplos:');
            costs.rows.forEach(c => console.log(`       - ${c.resource_type}: Kz ${c.cost_per_unit} por ${c.unit_name}`));
        }
        // Transactions
        const txCount = await executeQuery('SELECT COUNT(*) as count FROM transactions');
        console.log(`\n  💳 Transactions: ${txCount.rows[0].count} registros`);
        if (parseInt(txCount.rows[0].count) > 0) {
            const txs = await executeQuery('SELECT type, status, amount, created_at FROM transactions ORDER BY created_at DESC LIMIT 5');
            console.log('     Últimas transações:');
            txs.rows.forEach(t => console.log(`       - ${t.type}: Kz ${t.amount} (${t.status})`));
        }
        // Companies
        const companiesCount = await executeQuery('SELECT COUNT(*) as count FROM companies');
        console.log(`\n  🏢 Companies: ${companiesCount.rows[0].count} registros`);
        if (parseInt(companiesCount.rows[0].count) > 0) {
            const companies = await executeQuery('SELECT id, name, status, credits, plan_id FROM companies LIMIT 5');
            console.log('     Exemplos:');
            companies.rows.forEach(c => console.log(`       - ${c.name}: ${c.credits} créditos (${c.status})`));
        }
        // 3. Testar Queries do BillingService
        console.log('\n\n🧪 3. TESTANDO QUERIES DO BILLING SERVICE...\n');
        try {
            const stats = await executeQuery(`
                SELECT
                    COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED' AND created_at > now() - interval '30 days'), 0) as mrr,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) as pending_payments,
                    COALESCE(SUM(credits) FILTER (WHERE type = 'TOPUP' AND status = 'COMPLETED' AND created_at > now() - interval '30 days'), 0) as credits_sold,
                    COUNT(*) FILTER (WHERE type = 'PLAN_UPGRADE' AND status = 'COMPLETED' AND created_at > now() - interval '30 days') as new_subscriptions
                FROM transactions
            `);
            console.log('  ✅ Query de Stats: OK');
            console.log(`     MRR: Kz ${stats.rows[0].mrr}`);
            console.log(`     Pending Payments: Kz ${stats.rows[0].pending_payments}`);
        }
        catch (err) {
            console.log('  ❌ Query de Stats: ERRO');
            console.log(`     ${err.message}`);
        }
        try {
            const profitability = await executeQuery(`
                SELECT 
                    c.id,
                    c.name,
                    p.name as plan_name,
                    p.price as monthly_fee,
                    COUNT(DISTINCT ac.id) as total_analyses
                FROM companies c
                LEFT JOIN plans p ON c.plan_id = p.id
                LEFT JOIN analysis_costs ac ON ac.company_id = c.id AND ac.created_at > now() - interval '30 days'
                WHERE c.status = 'ACTIVE'
                GROUP BY c.id, c.name, p.name, p.price
                LIMIT 3
            `);
            console.log('\n  ✅ Query de Profitability: OK');
            console.log(`     Empresas analisadas: ${profitability.rows.length}`);
        }
        catch (err) {
            console.log('\n  ❌ Query de Profitability: ERRO');
            console.log(`     ${err.message}`);
        }
        // 4. Verificar Usuários SUPER_ADMIN
        console.log('\n\n👤 4. VERIFICANDO USUÁRIOS SUPER_ADMIN...\n');
        const admins = await executeQuery(`SELECT id, name, email, role FROM users WHERE role = 'SUPER_ADMIN'`);
        console.log(`  Total de SUPER_ADMIN: ${admins.rows.length}`);
        if (admins.rows.length > 0) {
            console.log('  Usuários:');
            admins.rows.forEach(u => console.log(`    - ${u.name} (${u.email})`));
        }
        else {
            console.log('  ⚠️  ATENÇÃO: Nenhum usuário SUPER_ADMIN encontrado!');
        }
        // 5. Resumo e Recomendações
        console.log('\n\n📋 5. RESUMO E RECOMENDAÇÕES...\n');
        const issues = [];
        if (parseInt(plansCount.rows[0].count) === 0) {
            issues.push('❌ Tabela "plans" está vazia - necessário criar planos de exemplo');
        }
        if (parseInt(packagesCount.rows[0].count) === 0) {
            issues.push('❌ Tabela "credit_packages" está vazia - necessário criar pacotes de exemplo');
        }
        if (parseInt(costsCount.rows[0].count) === 0) {
            issues.push('❌ Tabela "operational_costs" está vazia - necessário definir custos operacionais');
        }
        if (admins.rows.length === 0) {
            issues.push('❌ Nenhum usuário SUPER_ADMIN - necessário criar ou promover um usuário');
        }
        if (issues.length === 0) {
            console.log('  ✅ Sistema aparenta estar configurado corretamente!');
            console.log('  ℹ️  Se a página ainda não funciona, verificar:');
            console.log('     - Logs do servidor para erros HTTP');
            console.log('     - Console do browser para erros JavaScript');
            console.log('     - Network tab para ver quais requests falham');
        }
        else {
            console.log('  ⚠️  PROBLEMAS ENCONTRADOS:\n');
            issues.forEach(issue => console.log(`     ${issue}`));
            console.log('\n  💡 SOLUÇÃO: Execute a migration de seed de dados');
        }
        console.log('\n' + '='.repeat(60));
        console.log('✅ Diagnóstico concluído!\n');
    }
    catch (error) {
        console.error('\n❌ ERRO DURANTE DIAGNÓSTICO:', error.message);
        console.error(error.stack);
    }
    process.exit(0);
}
diagnoseBillingSystem();
