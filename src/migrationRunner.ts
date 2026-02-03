
import { runFullMigration } from './migrations/01_create_users_table.js';
import { runRobustAuthMigration } from './migrations/02_robust_auth_schema.js';
import { runPermissionsMigration } from './migrations/03_permissions_schema.js';
import { runAdminRobustnessMigration } from './migrations/04_admin_robustness.js';
import { runSecurityUpdatesMigration } from './migrations/05_security_updates.js';
import { runFaturixMigration } from './migrations/06_faturix_schema.js';
import { runBase64Migration } from './migrations/07_add_file_base64.js';
import { runNormalizeDocumentsMigration } from './migrations/08_normalize_documents_table.js';
import { runNormalizeTransactionsMigration } from './migrations/09_normalize_transactions_table.js';
import { runSystemLogsTableMigration } from './migrations/11_system_logs_table.js';
import { runFixAuditLogsMigration } from './migrations/12_fix_audit_logs_schema.js';
import { runRestoreMissingDocumentFieldsMigration } from './migrations/13_restore_missing_document_fields.js';
import { runAddDocumentResolutionFieldsMigration } from './migrations/15_add_document_resolution_fields.js';
import { runAddExtendedCompanyFieldsMigration } from './migrations/16_add_extended_company_fields.js';
import { runAddUserPromptsMigration } from './migrations/17_add_user_prompts.js';
import { runSplitUserPromptsMigration } from './migrations/18_split_user_prompts.js';
import { runFixForcePasswordDefaultMigration } from './migrations/19_fix_force_password_default.js';
import { runDropAgentPromptsMigration } from './migrations/20_drop_agent_prompts_col.js';
import { runFiscalEntitiesMigration } from './migrations/21_fiscal_entities_schema.js';
import { runFiscalEntitiesCompanyIdMigration } from './migrations/22_fiscal_entities_company_id.js';
import { runCreateFiscalAnalyticsViewMigration } from './migrations/23_create_fiscal_analytics_view.js';
import { runFixFiscalFunctionsFilterMigration } from './migrations/24_fix_fiscal_functions_filter.js';
import { runCreateAiAlertsTableMigration } from './migrations/25_create_ai_alerts_table.js';
import { runAddMissingCompanyColsMigration } from './migrations/26_add_missing_company_cols.js';
import { runAddOwnerIdToCompaniesMigration } from './migrations/27_add_owner_id_to_companies.js';
import { runFixFiscalEntitiesSchemaMigration } from './migrations/28_fix_fiscal_entities_schema.js';
import { runAddMissingFiscalColsMigration } from './migrations/29_add_missing_fiscal_cols.js';
import { runAddRetentionAndVatProcMigration } from './migrations/30_add_retention_and_vat_proc.js';
import { runFixUsersSchemaAlignmentMigration } from './migrations/32_fix_users_schema_alignment.js';
import { runFixCompanyStatusConstraintMigration } from './migrations/34_fix_company_status_constraint.js';
import { runAddTransactionsMetadataMigration } from './migrations/35_add_transactions_metadata.js';
import { runCreatePlansTableMigration } from './migrations/44_create_plans_table.js';
import { runRealtimeSessionsMigration } from './migrations/45_realtime_sessions.js';
import { runCreateCreditPackagesTableMigration } from './migrations/46_create_credit_packages_table.js';
import { runCreateOperationalCostsTableMigration } from './migrations/47_create_operational_costs_table.js';
import { runCreateAnalysisCostsTableMigration } from './migrations/48_create_analysis_costs_table.js';
import { runCreateFinancialSnapshotsTableMigration } from './migrations/49_create_financial_snapshots_table.js';
import { runExpandTransactionsPlansTablesMigration } from './migrations/50_expand_transactions_plans_tables.js';
import { runPurchaseColumnsMigration } from './migrations/51_add_purchase_columns.js';
import { runSystemSettingsTableMigration } from './migrations/52_create_system_settings.js';
import { runAgentPromptsMigration } from './migrations/53_create_agent_prompts.js';
import { runAddActiveStatusToAgentsMigration } from './migrations/54_add_active_status_to_agents.js';
import { runPlansToCreditsMigration } from './migrations/55_plans_to_credits.js';
import { runHealingBillingMigration } from './migrations/99_healing_billing.js';
import { runHealTransactionsMigration } from './migrations/100_heal_transactions_table.js';
import { runServerSubscriptionsMigration } from './migrations/61_create_server_subscriptions_table.js';
import { runAddN8nFieldsToSubscriptionsMigration } from './migrations/62_add_n8n_fields_to_subscriptions.js';
import { runServerPerformancePlansMigration } from './migrations/63_create_server_performance_plans_table.js';
import { addPricingFieldsToServerPlans } from './migrations/64_add_pricing_fields_to_server_plans.js';
import { addHardwareSpecsToServerPlans } from './migrations/65_add_hardware_specs_to_server_plans.js';
import { runStorageMigration } from './migrations/64_add_storage_columns_to_documents.js';
import { runSurgicalFixFaturixStats } from './migrations/101_surgical_fix_faturix_stats.js';
import { runAlignServerPlansSchemaMigration } from './migrations/66_align_server_plans_schema.js';


import { settingsService } from './admin/settings.service.js';

export async function runAllMigrations() {
    console.log('🚀 [MigrationRunner] Starting robust migration sequence...');

    // Helper to run a migration and log success/failure without crashing the app
    const run = async (name: string, migrationFn: () => Promise<void>) => {
        try {
            process.stdout.write(`   Running ${name}... `);
            await migrationFn();
            console.log('✅');
        } catch (err: any) {
            console.log('❌');
            console.error(`   ⚠️  Migration '${name}' failed silently:`, err.message);
            // We continue, as this might be a non-critical update or already applied state
        }
    };

    try {
        await run('Full Migration (Base)', runFullMigration);
        await run('Robust Auth', runRobustAuthMigration);
        await run('Permissions', runPermissionsMigration);
        await run('Admin Robustness', runAdminRobustnessMigration);
        await run('Security Updates', runSecurityUpdatesMigration);
        await run('Faturix Schema', runFaturixMigration);
        await run('Base64 Files', runBase64Migration);
        await run('Normalize Documents', runNormalizeDocumentsMigration);
        await run('Normalize Transactions', runNormalizeTransactionsMigration);

        // Critical System Logs - if this fails, we might want to know, but keep running
        await run('System Logs', runSystemLogsTableMigration);
        await run('Audit Logs Fix', runFixAuditLogsMigration);

        // Feature Migrations
        await run('Restore Doc Fields', runRestoreMissingDocumentFieldsMigration);
        await run('Doc Resolution Fields', runAddDocumentResolutionFieldsMigration);
        await run('Extended Company Fields', runAddExtendedCompanyFieldsMigration);
        await run('User Prompts', runAddUserPromptsMigration);
        await run('Split User Prompts', runSplitUserPromptsMigration);
        await run('Force Password Default', runFixForcePasswordDefaultMigration);
        await run('Drop Agent Prompts Col', runDropAgentPromptsMigration);

        // Fiscal & Reporting
        await run('Fiscal Entities', runFiscalEntitiesMigration);
        await run('Fiscal Entities CompanyId', runFiscalEntitiesCompanyIdMigration);
        await run('Fiscal Analytics View', runCreateFiscalAnalyticsViewMigration);
        await run('Fix Fiscal Func', runFixFiscalFunctionsFilterMigration);
        await run('AI Alerts', runCreateAiAlertsTableMigration);
        await run('Missing Company Cols', runAddMissingCompanyColsMigration);
        await run('Owner ID', runAddOwnerIdToCompaniesMigration);
        await run('Fix Fiscal Entities Schema', runFixFiscalEntitiesSchemaMigration);
        await run('Missing Fiscal Cols', runAddMissingFiscalColsMigration);
        await run('Retention & VAT', runAddRetentionAndVatProcMigration);
        await run('Fix Users Alignment', runFixUsersSchemaAlignmentMigration);
        await run('Fix Company Status', runFixCompanyStatusConstraintMigration);
        await run('Trans Metadata', runAddTransactionsMetadataMigration);

        // Modules
        await run('Plans Table', runCreatePlansTableMigration);
        await run('Realtime Sessions', runRealtimeSessionsMigration);
        await run('Credit Packages', runCreateCreditPackagesTableMigration);
        await run('Operational Costs', runCreateOperationalCostsTableMigration);
        await run('Analysis Costs', runCreateAnalysisCostsTableMigration);
        await run('Financial Snapshots', runCreateFinancialSnapshotsTableMigration);
        await run('Expand Trans/Plans', runExpandTransactionsPlansTablesMigration);
        await run('Purchase Columns', runPurchaseColumnsMigration);
        await run('Server Subscriptions', runServerSubscriptionsMigration);
        await run('N8N Fields', runAddN8nFieldsToSubscriptionsMigration);
        await run('Server Perf Plans', runServerPerformancePlansMigration);
        await run('Pricing Fields', addPricingFieldsToServerPlans);
        await run('Hardware Specs', addHardwareSpecsToServerPlans);
        await run('Cloud Storage', runStorageMigration);
        await run('Align Server Plans', runAlignServerPlansSchemaMigration);

        // System Config
        await run('System Settings', runSystemSettingsTableMigration);
        await run('Agent Prompts', runAgentPromptsMigration);
        await run('Active Agents', runAddActiveStatusToAgentsMigration);

        // Final Healers
        await run('Healing Billing', runHealingBillingMigration);
        await run('Plans to Credits', runPlansToCreditsMigration);
        await run('Heal Transactions', runHealTransactionsMigration);
        await run('Surgical Fix Faturix Stats', runSurgicalFixFaturixStats);


        // Settings Cache
        console.log('   Running Settings Cache Init...');
        try {
            await settingsService.loadCache();
            console.log('   ✅ Settings Cache Loaded.');
        } catch (e: any) {
            console.error('   ⚠️ Failed to load settings cache:', e.message);
        }

        console.log('🏁 [MigrationRunner] Sequence completed.');
    } catch (criticalError) {
        console.error('🔥 [MigrationRunner] Critical Runtime Error:', criticalError);
        // Even on critical error, we might want to let the server try to start
    }
}
